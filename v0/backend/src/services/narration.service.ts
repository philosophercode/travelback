import { TripRepository } from '../database/repositories/trip.repository';
import { PhotoRepository } from '../database/repositories/photo.repository';
import { ItineraryRepository } from '../database/repositories/itinerary.repository';
import { NarrationAnswerRepository } from '../database/repositories/narration-answer.repository';
import { NarrationQuestionAgent } from '../agents/narration-question.agent';
import { PersonalizedItineraryAgent } from '../agents/personalized-itinerary.agent';
import {
  NarrationState,
  NarrationQuestion,
  NarrationAnswer,
  PhotoNarrationContext,
  CreateNarrationAnswerData,
  ProcessingStatus,
} from '../types';
import { logger } from '../utils/logger';

export class NarrationService {
  private tripRepo: TripRepository;
  private photoRepo: PhotoRepository;
  private itineraryRepo: ItineraryRepository;
  private answerRepo: NarrationAnswerRepository;
  private questionAgent: NarrationQuestionAgent;
  private personalizedAgent: PersonalizedItineraryAgent;

  constructor() {
    this.tripRepo = new TripRepository();
    this.photoRepo = new PhotoRepository();
    this.itineraryRepo = new ItineraryRepository();
    this.answerRepo = new NarrationAnswerRepository();
    this.questionAgent = new NarrationQuestionAgent();
    this.personalizedAgent = new PersonalizedItineraryAgent();
  }

  /**
   * Start narration wizard for a trip
   */
  async startNarration(tripId: string): Promise<NarrationState> {
    const trip = await this.tripRepo.findById(tripId);
    if (!trip) {
      throw new Error('Trip not found');
    }

    if (trip.processingStatus !== ProcessingStatus.COMPLETED) {
      throw new Error('Trip processing must be completed before narration');
    }

    // Get all days with photos
    const photos = await this.photoRepo.findByTrip(tripId);
    const daysWithPhotos = new Set<number>();
    photos.forEach((photo) => {
      if (photo.dayNumber) {
        daysWithPhotos.add(photo.dayNumber);
      }
    });

    const sortedDays = Array.from(daysWithPhotos).sort((a, b) => a - b);
    const firstDay = sortedDays.length > 0 ? sortedDays[0] : undefined;

    const state: NarrationState = {
      enabled: true,
      status: 'in_progress',
      currentDayNumber: firstDay,
      currentPhotoIndex: 0,
      completedDays: [],
      completedPhotos: [],
    };

    await this.tripRepo.updateNarrationState(tripId, state);
    logger.info(`[Trip ${tripId}] Started narration wizard`);
    return state;
  }

  /**
   * Get photo context for narration (what to show user)
   */
  async getPhotoContext(tripId: string, photoId: string): Promise<PhotoNarrationContext> {
    const photo = await this.photoRepo.findById(photoId);
    if (!photo || photo.tripId !== tripId) {
      throw new Error('Photo not found');
    }

    if (!photo.description) {
      throw new Error('Photo has no description');
    }

    const summary = await this.questionAgent.generatePhotoSummary(photo, photo.description);

    return {
      photo,
      description: photo.description,
      location: {
        city: photo.locationCity || undefined,
        country: photo.locationCountry || undefined,
        landmark: photo.locationLandmark || undefined,
      },
      summary,
    };
  }

  /**
   * Get questions for a photo
   */
  async getPhotoQuestions(tripId: string, photoId: string): Promise<NarrationQuestion[]> {
    const photo = await this.photoRepo.findById(photoId);
    if (!photo || photo.tripId !== tripId) {
      throw new Error('Photo not found');
    }

    if (!photo.description) {
      throw new Error('Photo has no description');
    }

    return await this.questionAgent.generatePhotoQuestions(photo, photo.description);
  }

  /**
   * Submit answer for a question
   */
  async submitAnswer(tripId: string, answer: NarrationAnswer, questionText: string): Promise<void> {
    const trip = await this.tripRepo.findById(tripId);
    if (!trip) {
      throw new Error('Trip not found');
    }

    // Save answer to database
    const answerData: CreateNarrationAnswerData = {
      tripId,
      photoId: answer.photoId,
      dayNumber: answer.dayNumber,
      questionId: answer.questionId,
      questionText,
      answerText: answer.answer,
      answerAudioUrl: answer.audioUrl,
    };

    await this.answerRepo.create(answerData);

    // Update narration state
    const currentState = trip.narrationState || {
      enabled: true,
      status: 'in_progress',
      completedDays: [],
      completedPhotos: [],
    };

    if (!currentState.completedPhotos.includes(answer.photoId)) {
      currentState.completedPhotos.push(answer.photoId);
    }

    await this.tripRepo.updateNarrationState(tripId, currentState);

    logger.debug(`[Trip ${tripId}] Submitted answer for photo ${answer.photoId}`);
  }

  /**
   * Complete narration and generate personalized itinerary
   */
  async completeNarration(tripId: string): Promise<void> {
    logger.info(`[Trip ${tripId}] Completing narration and generating personalized itinerary`);

    // Get all answers grouped by day and photo
    const allAnswers = await this.answerRepo.findByTrip(tripId);
    const answersByPhoto = new Map<string, NarrationAnswer[]>();
    
    allAnswers.forEach((answer) => {
      if (!answersByPhoto.has(answer.photoId)) {
        answersByPhoto.set(answer.photoId, []);
      }
      answersByPhoto.get(answer.photoId)!.push(answer);
    });

    // Get all photos with descriptions
    const photos = await this.photoRepo.findByTrip(tripId);
    const photosByDay = new Map<number, Photo[]>();
    const photoDescriptions = new Map<string, PhotoDescription>();

    photos.forEach((photo) => {
      if (photo.dayNumber && photo.description) {
        if (!photosByDay.has(photo.dayNumber)) {
          photosByDay.set(photo.dayNumber, []);
        }
        photosByDay.get(photo.dayNumber)!.push(photo);
        photoDescriptions.set(photo.id, photo.description);
      }
    });

    // Get original day itineraries
    const originalItineraries = await this.itineraryRepo.findByTrip(tripId);
    const itinerariesByDay = new Map<number, typeof originalItineraries[0]>();
    originalItineraries.forEach((itinerary) => {
      itinerariesByDay.set(itinerary.dayNumber, itinerary);
    });

    // Regenerate each day itinerary with personalization
    const sortedDays = Array.from(photosByDay.keys()).sort((a, b) => a - b);
    
    for (const dayNumber of sortedDays) {
      const dayPhotos = photosByDay.get(dayNumber)!;
      const originalItinerary = itinerariesByDay.get(dayNumber);
      
      if (!originalItinerary) {
        logger.warn(`[Trip ${tripId}] No original itinerary for day ${dayNumber}, skipping`);
        continue;
      }

      // Get answers for this day's photos
      const dayPhotoAnswers = new Map<string, NarrationAnswer[]>();
      dayPhotos.forEach((photo) => {
        const answers = answersByPhoto.get(photo.id) || [];
        if (answers.length > 0) {
          dayPhotoAnswers.set(photo.id, answers);
        }
      });

      // Generate personalized itinerary
      const personalizedSummary = await this.personalizedAgent.generatePersonalizedDayItinerary(
        dayPhotos,
        photoDescriptions,
        dayPhotoAnswers,
        originalItinerary.summary
      );

      // Update day itinerary
      await this.itineraryRepo.update(originalItinerary.id, {
        summary: personalizedSummary,
      });

      logger.info(`[Trip ${tripId}] Generated personalized itinerary for day ${dayNumber}`);
    }

    // Regenerate trip overview
    const updatedItineraries = await this.itineraryRepo.findByTrip(tripId);
    const trip = await this.tripRepo.findById(tripId);
    
    if (trip && trip.overview) {
      const personalizedOverview = await this.personalizedAgent.generatePersonalizedTripOverview(
        updatedItineraries,
        trip.overview,
        photos.length
      );

      await this.tripRepo.updateOverview(tripId, personalizedOverview);
      logger.info(`[Trip ${tripId}] Generated personalized trip overview`);
    }

    // Update narration state to completed
    const finalState: NarrationState = {
      enabled: true,
      status: 'completed',
      completedDays: sortedDays,
      completedPhotos: Array.from(answersByPhoto.keys()),
    };

    await this.tripRepo.updateNarrationState(tripId, finalState);
    logger.info(`[Trip ${tripId}] Narration completed successfully`);
  }

  /**
   * Get current narration state
   */
  async getNarrationState(tripId: string): Promise<NarrationState | null> {
    const trip = await this.tripRepo.findById(tripId);
    return trip?.narrationState || null;
  }
}

export const narrationService = new NarrationService();

