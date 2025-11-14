import { Request, Response } from 'express';
import { TripRepository } from '../database/repositories/trip.repository';
import { PhotoRepository } from '../database/repositories/photo.repository';
import { ItineraryRepository } from '../database/repositories/itinerary.repository';
import { storageService } from '../services/storage.service';
import { exifService } from '../services/exif.service';
import { locationService } from '../services/location.service';
import { processingService } from '../services/processing.service';
import { sseService } from '../services/sse.service';
import { AppError } from '../middleware/error-handler';
import { ApiResponse, CreateTripData } from '../types';
import { logger } from '../utils/logger';

const tripRepo = new TripRepository();
const photoRepo = new PhotoRepository();
const itineraryRepo = new ItineraryRepository();

/**
 * Create a new trip
 */
export async function createTrip(req: Request, res: Response): Promise<void> {
  const { name, startDate } = req.body;

  if (!name || typeof name !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Trip name is required', 400);
  }

  const tripData: CreateTripData = {
    name: name.trim(),
    startDate: startDate ? new Date(startDate) : undefined,
  };

  const trip = await tripRepo.create(tripData);

  const response: ApiResponse<{ trip: typeof trip }> = {
    success: true,
    data: { trip },
  };

  res.status(201).json(response);
}

/**
 * Upload photos to a trip
 */
export async function uploadPhotos(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params;
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'No photos provided', 400);
  }

  // Verify trip exists
  const trip = await tripRepo.findById(tripId);
  if (!trip) {
    throw new AppError('NOT_FOUND', 'Trip not found', 404);
  }

  // Process each photo
  const photos = [];
  for (const file of files) {
    try {
      // Generate unique filename: timestamp-originalname
      const timestamp = Date.now();
      const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${timestamp}-${originalName}`;

      // Save file
      const filePath = await storageService.save(file.buffer!, filename);
      const fileUrl = await storageService.getUrl(filePath);

      // Extract EXIF
      const exifData = await exifService.extractMetadata(file.buffer!);
      const capturedAt = exifService.getCaptureDate(exifData);
      const gpsCoords = exifService.getGPSCoordinates(exifData);

      // Get location if GPS available
      let locationData = null;
      if (gpsCoords) {
        locationData = await locationService.getLocation(
          gpsCoords.latitude,
          gpsCoords.longitude
        );
      }

      // Create photo record
      const photo = await photoRepo.create({
        tripId,
        filename: file.originalname,
        filePath,
        fileUrl,
        capturedAt: capturedAt || undefined,
        exifData: exifData || undefined,
      });

      // Update location if available
      if (locationData) {
        await photoRepo.updateLocation(photo.id, locationData);
      }

      photos.push(photo);
    } catch (error) {
      logger.error(`Failed to process photo ${file.originalname}`, error);
      // Continue with other photos
    }
  }

  const response: ApiResponse<{
    uploadedCount: number;
    photos: typeof photos;
  }> = {
    success: true,
    data: {
      uploadedCount: photos.length,
      photos,
    },
  };

  res.status(201).json(response);
}

/**
 * Process a trip (trigger AI processing)
 */
export async function processTrip(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params;

  // Verify trip exists
  const trip = await tripRepo.findById(tripId);
  if (!trip) {
    throw new AppError('NOT_FOUND', 'Trip not found', 404);
  }

  // Check if trip has photos
  const photos = await photoRepo.findByTrip(tripId);
  if (photos.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Trip has no photos to process', 400);
  }

  // Start processing asynchronously (don't wait for completion)
  processingService.processTrip(tripId).catch((error) => {
    logger.error(`Background processing failed for trip ${tripId}`, error);
  });

  const response: ApiResponse<{
    status: string;
    message: string;
    estimatedTime: string;
  }> = {
    success: true,
    data: {
      status: 'processing',
      message: `Processing started for ${photos.length} photos`,
      estimatedTime: '2-5 minutes',
    },
  };

  res.status(202).json(response);
}

/**
 * Get trip details with overview and days
 */
export async function getTrip(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params;

  const trip = await tripRepo.findById(tripId);
  if (!trip) {
    throw new AppError('NOT_FOUND', 'Trip not found', 404);
  }

  // Get day itineraries
  const days = await itineraryRepo.findByTrip(tripId);

  // Get photo count
  const photos = await photoRepo.findByTrip(tripId);

  const response: ApiResponse<{
    trip: typeof trip;
    days: typeof days;
    totalPhotos: number;
  }> = {
    success: true,
    data: {
      trip,
      days,
      totalPhotos: photos.length,
    },
  };

  res.json(response);
}

/**
 * Get day itinerary with photos
 */
export async function getDayItinerary(req: Request, res: Response): Promise<void> {
  const { tripId, dayNumber } = req.params;

  const dayNum = parseInt(dayNumber, 10);
  if (isNaN(dayNum)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid day number', 400);
  }

  // Verify trip exists
  const trip = await tripRepo.findById(tripId);
  if (!trip) {
    throw new AppError('NOT_FOUND', 'Trip not found', 404);
  }

  // Get day itinerary
  const day = await itineraryRepo.findByDayNumber(tripId, dayNum);
  if (!day) {
    throw new AppError('NOT_FOUND', 'Day itinerary not found', 404);
  }

  // Get photos for this day
  const photos = await photoRepo.findByDay(tripId, dayNum);

  const response: ApiResponse<{
    day: typeof day;
    photos: typeof photos;
  }> = {
    success: true,
    data: {
      day,
      photos,
    },
  };

  res.json(response);
}

/**
 * Get trip status stream via Server-Sent Events (SSE)
 */
export async function getTripStatusStream(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params;

  // Verify trip exists
  const trip = await tripRepo.findById(tripId);
  if (!trip) {
    throw new AppError('NOT_FOUND', 'Trip not found', 404);
  }

  // Register client for SSE stream
  sseService.registerClient(tripId, res);

  // Send current status immediately
  sseService.sendToTrip(tripId, {
    type: 'status',
    data: { status: trip.processingStatus },
  });

  // Keep connection open - SSE service handles cleanup on disconnect
}

