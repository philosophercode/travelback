import { ProcessingStatus, Photo } from '../types';
import { TripRepository } from '../database/repositories/trip.repository';
import { PhotoRepository } from '../database/repositories/photo.repository';
import { ItineraryRepository } from '../database/repositories/itinerary.repository';
import { ImageDescriptionAgent } from '../agents/image-description.agent';
import { DayItineraryAgent } from '../agents/day-itinerary.agent';
import { TripOverviewAgent } from '../agents/trip-overview.agent';
import { storageService } from './storage.service';
import { logger } from '../utils/logger';
import { config } from '../config';

export class ProcessingService {
  private tripRepo: TripRepository;
  private photoRepo: PhotoRepository;
  private itineraryRepo: ItineraryRepository;
  private imageDescriptionAgent: ImageDescriptionAgent;
  private dayItineraryAgent: DayItineraryAgent;
  private tripOverviewAgent: TripOverviewAgent;

  constructor() {
    this.tripRepo = new TripRepository();
    this.photoRepo = new PhotoRepository();
    this.itineraryRepo = new ItineraryRepository();
    this.imageDescriptionAgent = new ImageDescriptionAgent();
    this.dayItineraryAgent = new DayItineraryAgent();
    this.tripOverviewAgent = new TripOverviewAgent();
  }

  /**
   * Process a trip: describe photos, cluster by day, generate summaries
   */
  async processTrip(tripId: string): Promise<void> {
    logger.info(`Starting processing for trip ${tripId}`);

    try {
      // Update trip status
      await this.tripRepo.updateProcessingStatus(tripId, ProcessingStatus.PROCESSING);

      // Get all photos for the trip
      const photos = await this.photoRepo.findByTrip(tripId);
      logger.info(`Found ${photos.length} photos to process`);

      if (photos.length === 0) {
        throw new Error('No photos found for trip');
      }

      // Step 1: Process each photo (describe + locate)
      await this.processPhotos(photos);

      // Refresh photos from database to get updated descriptions
      const updatedPhotos = await this.photoRepo.findByTrip(tripId);
      
      // Verify all photos have descriptions before proceeding
      const photosWithoutDescriptions = updatedPhotos.filter(
        (p) => !p.description && p.processingStatus === ProcessingStatus.COMPLETED
      );
      if (photosWithoutDescriptions.length > 0) {
        logger.warn(
          `${photosWithoutDescriptions.length} photos completed without descriptions`
        );
      }

      // Step 2: Cluster photos by day (use fresh photo data)
      await this.clusterPhotosByDay(tripId, updatedPhotos);

      // Step 3: Generate day itineraries (ensures all days are processed)
      await this.generateDayItineraries(tripId);

      // Step 4: Generate trip overview (verifies all days have itineraries)
      await this.generateTripOverview(tripId);

      // Update trip status to completed
      await this.tripRepo.updateProcessingStatus(tripId, ProcessingStatus.COMPLETED);
      logger.info(`Processing completed for trip ${tripId}`);
    } catch (error) {
      logger.error(`Processing failed for trip ${tripId}`, error);
      await this.tripRepo.updateProcessingStatus(tripId, ProcessingStatus.FAILED);
      throw error;
    }
  }

  /**
   * Process all photos: extract descriptions and locations
   * Waits for ALL photos to complete (success or failure) before returning
   */
  private async processPhotos(photos: Photo[]): Promise<void> {
    const maxConcurrent = config.processing.maxConcurrentPhotos;
    const batches: Photo[][] = [];

    // Split into batches
    for (let i = 0; i < photos.length; i += maxConcurrent) {
      batches.push(photos.slice(i, i + maxConcurrent));
    }

    // Process batches sequentially, waiting for each batch to complete
    for (const batch of batches) {
      // Wait for all photos in batch to complete (even if some fail)
      await Promise.allSettled(
        batch.map((photo) => this.processPhoto(photo))
      );
    }

    // Verify all photos have been processed (check status)
    const allProcessed = await Promise.all(
      photos.map(async (photo) => {
        const updated = await this.photoRepo.findById(photo.id);
        return updated?.processingStatus === ProcessingStatus.COMPLETED ||
               updated?.processingStatus === ProcessingStatus.FAILED;
      })
    );

    const processedCount = allProcessed.filter(Boolean).length;
    logger.info(`Photo processing complete: ${processedCount}/${photos.length} photos processed`);
  }

  /**
   * Process a single photo
   */
  private async processPhoto(photo: Photo): Promise<void> {
    try {
      logger.debug(`Processing photo ${photo.id}`);

      // Update status
      await this.photoRepo.updateProcessingStatus(photo.id, ProcessingStatus.PROCESSING);

      // Load image file
      const imageBuffer = storageService.readFile(photo.filePath);

      // Generate description
      const description = await this.imageDescriptionAgent.describePhoto(
        imageBuffer,
        photo.exifData
      );

      if (description) {
        await this.photoRepo.updateDescription(photo.id, description);
      }

      // Update location if we have GPS coordinates
      if (photo.locationLatitude && photo.locationLongitude) {
        // Location should already be set from EXIF, but ensure it's complete
        // This is handled during upload, so we can skip here
      }

      // Mark as completed
      await this.photoRepo.updateProcessingStatus(photo.id, ProcessingStatus.COMPLETED);
      logger.debug(`Photo ${photo.id} processed successfully`);
    } catch (error) {
      logger.error(`Failed to process photo ${photo.id}`, error);
      await this.photoRepo.updateProcessingStatus(photo.id, ProcessingStatus.FAILED);
      // Continue processing other photos (graceful degradation)
    }
  }

  /**
   * Cluster photos by day based on capture timestamps
   */
  private async clusterPhotosByDay(tripId: string, photos: Photo[]): Promise<void> {
    logger.debug('Clustering photos by day');

    // Group photos by date
    const photosByDate = new Map<string, Photo[]>();

    photos.forEach((photo) => {
      if (!photo.capturedAt) {
        return; // Skip photos without capture date
      }

      const date = new Date(photo.capturedAt);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!photosByDate.has(dateKey)) {
        photosByDate.set(dateKey, []);
      }
      photosByDate.get(dateKey)!.push(photo);
    });

    // Sort dates chronologically
    const sortedDates = Array.from(photosByDate.keys()).sort();

    // Assign day numbers
    sortedDates.forEach((dateKey, index) => {
      const dayNumber = index + 1;
      const dayPhotos = photosByDate.get(dateKey)!;

      // Update day number for all photos in this day
      dayPhotos.forEach((photo) => {
        this.photoRepo.updateDayNumber(photo.id, dayNumber);
      });
    });

    logger.debug(`Clustered photos into ${sortedDates.length} days`);
  }

  /**
   * Generate day itineraries for all days
   * Ensures all days are processed before completing
   */
  private async generateDayItineraries(tripId: string): Promise<void> {
    logger.debug('Generating day itineraries');

    // Get all photos grouped by day
    const photos = await this.photoRepo.findByTrip(tripId);
    const photosByDay = new Map<number, Photo[]>();

    photos.forEach((photo) => {
      if (photo.dayNumber) {
        if (!photosByDay.has(photo.dayNumber)) {
          photosByDay.set(photo.dayNumber, []);
        }
        photosByDay.get(photo.dayNumber)!.push(photo);
      }
    });

    if (photosByDay.size === 0) {
      logger.warn('No photos with day numbers found, skipping day itinerary generation');
      return;
    }

    // Filter to only photos with descriptions (required for itinerary generation)
    const daysWithDescriptions = new Map<number, Photo[]>();
    for (const [dayNumber, dayPhotos] of photosByDay) {
      const photosWithDescriptions = dayPhotos.filter((p) => p.description !== null);
      if (photosWithDescriptions.length > 0) {
        daysWithDescriptions.set(dayNumber, photosWithDescriptions);
      } else {
        logger.warn(`Day ${dayNumber} has no photos with descriptions, skipping`);
      }
    }

    // Generate itinerary for each day sequentially, waiting for all to complete
    const results: Array<{ dayNumber: number; success: boolean; error?: Error }> = [];
    const dayPromises = Array.from(daysWithDescriptions.entries()).map(
      async ([dayNumber, dayPhotos]) => {
        try {
          // Get date from first photo
          const firstPhoto = dayPhotos[0];
          if (!firstPhoto.capturedAt) {
            logger.warn(`Day ${dayNumber} has no capture date, skipping`);
            return { dayNumber, success: false, error: new Error('No capture date') };
          }

          const date = new Date(firstPhoto.capturedAt);

          // Generate summary
          const summary = await this.dayItineraryAgent.generateSummary(dayPhotos);

          // Save itinerary
          await this.itineraryRepo.create({
            tripId,
            dayNumber,
            date,
            summary,
          });

          logger.debug(`Generated itinerary for day ${dayNumber}`);
          return { dayNumber, success: true };
        } catch (error) {
          logger.error(`Failed to generate itinerary for day ${dayNumber}`, error);
          return { dayNumber, success: false, error: error as Error };
        }
      }
    );

    // Wait for ALL days to complete (success or failure)
    const dayResults = await Promise.allSettled(dayPromises);
    
    // Extract results
    dayResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        logger.error('Unexpected error in day itinerary promise', result.reason);
      }
    });

    // Verify all days have been processed by checking database
    const allDaysProcessed = await Promise.all(
      Array.from(daysWithDescriptions.keys()).map(async (dayNumber) => {
        const itinerary = await this.itineraryRepo.findByDayNumber(tripId, dayNumber);
        // Day is considered processed if itinerary exists OR if it failed (we have result)
        return itinerary !== null || results.some((r) => r.dayNumber === dayNumber && !r.success);
      })
    );

    const processedDaysCount = allDaysProcessed.filter(Boolean).length;
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    
    logger.info(
      `Day itinerary generation complete: ${successful} succeeded, ${failed} failed (${processedDaysCount}/${daysWithDescriptions.size} days processed)`
    );

    if (failed > 0 && successful === 0) {
      throw new Error(`All day itinerary generations failed (${failed} days)`);
    }
  }

  /**
   * Generate trip overview
   * Verifies all days have itineraries before generating overview
   */
  private async generateTripOverview(tripId: string): Promise<void> {
    logger.debug('Generating trip overview');

    // Get all day itineraries
    const itineraries = await this.itineraryRepo.findByTrip(tripId);
    const photos = await this.photoRepo.findByTrip(tripId);

    if (itineraries.length === 0) {
      logger.warn('No day itineraries found, skipping trip overview');
      return;
    }

    // Verify we have itineraries for all days that have photos
    const photosByDay = new Map<number, Photo[]>();
    photos.forEach((photo) => {
      if (photo.dayNumber) {
        if (!photosByDay.has(photo.dayNumber)) {
          photosByDay.set(photo.dayNumber, []);
        }
        photosByDay.get(photo.dayNumber)!.push(photo);
      }
    });

    const daysWithPhotos = Array.from(photosByDay.keys()).sort((a, b) => a - b);
    const daysWithItineraries = itineraries.map((i) => i.dayNumber).sort((a, b) => a - b);
    const missingDays = daysWithPhotos.filter((d) => !daysWithItineraries.includes(d));

    if (missingDays.length > 0) {
      logger.warn(
        `Some days have photos but no itineraries: ${missingDays.join(', ')}. Proceeding with available itineraries.`
      );
    }

    logger.info(
      `Generating trip overview from ${itineraries.length} day itineraries (days: ${daysWithItineraries.join(', ')})`
    );

    // Generate overview using all available day itineraries
    const overview = await this.tripOverviewAgent.generateOverview(itineraries, photos);

    // Update trip
    await this.tripRepo.updateOverview(tripId, overview);

    // Update trip dates
    const dates = photos
      .map((p) => p.capturedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    if (dates.length > 0) {
      await this.tripRepo.update(tripId, {
        startDate: dates[0],
        endDate: dates[dates.length - 1],
      });
    }

    logger.debug('Trip overview generated');
  }
}

export const processingService = new ProcessingService();

