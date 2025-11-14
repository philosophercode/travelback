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
 * Generate a default trip name based on current date
 */
function generateDefaultTripName(): string {
  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear();
  return `${month} ${year} Trip`;
}

/**
 * Create a new trip
 */
export async function createTrip(req: Request, res: Response): Promise<void> {
  const { name, startDate } = req.body;

  // Auto-generate name if not provided
  const tripName = name && typeof name === 'string' && name.trim()
    ? name.trim()
    : generateDefaultTripName();

  const tripData: CreateTripData = {
    name: tripName,
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
 * Create a trip and upload photos in one request
 */
export async function createTripWithPhotos(req: Request, res: Response): Promise<void> {
  const uploadStartTime = Date.now();
  const { name, startDate } = req.body;
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'No photos provided', 400);
  }

  logger.info(`📤 Starting upload: ${files.length} photo(s)`);

  // Auto-generate name if not provided
  const tripName = name && typeof name === 'string' && name.trim()
    ? name.trim()
    : generateDefaultTripName();

  // Create trip
  const tripData: CreateTripData = {
    name: tripName,
    startDate: startDate ? new Date(startDate) : undefined,
  };

  const trip = await tripRepo.create(tripData);
  logger.info(`[Trip ${trip.id}] ✅ Trip created: "${tripName}"`);

  // Process each photo
  const photos = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const photoStartTime = Date.now();
    try {
      logger.info(`[Trip ${trip.id}] 📷 Uploading photo ${i + 1}/${files.length}: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // Generate unique filename: timestamp-originalname
      const timestamp = Date.now();
      const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `${timestamp}-${originalName}`;

      // Save file
      const filePath = await storageService.save(file.buffer!, filename);
      const fileUrl = await storageService.getUrl(filePath);
      logger.debug(`[Trip ${trip.id}] 📷 Photo ${i + 1}: File saved to ${filePath}`);

      // Extract EXIF
      const exifData = await exifService.extractMetadata(file.buffer!);
      const capturedAt = exifService.getCaptureDate(exifData);
      const gpsCoords = exifService.getGPSCoordinates(exifData);
      
      if (capturedAt) {
        logger.debug(`[Trip ${trip.id}] 📷 Photo ${i + 1}: Capture date extracted: ${capturedAt.toISOString()}`);
      }
      if (gpsCoords) {
        logger.debug(`[Trip ${trip.id}] 📷 Photo ${i + 1}: GPS coordinates found: ${gpsCoords.latitude}, ${gpsCoords.longitude}`);
      }

      // Get location if GPS available
      let locationData = null;
      if (gpsCoords) {
        try {
          locationData = await locationService.getLocation(
            gpsCoords.latitude,
            gpsCoords.longitude
          );
          if (locationData) {
            logger.debug(`[Trip ${trip.id}] 📷 Photo ${i + 1}: Location geocoded: ${locationData.city || 'Unknown'}, ${locationData.country || 'Unknown'}`);
          }
        } catch (error) {
          logger.warn(`[Trip ${trip.id}] 📷 Photo ${i + 1}: Geocoding failed`, error);
        }
      }

      // Create photo record
      const photo = await photoRepo.create({
        tripId: trip.id,
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
      successCount++;
      const photoDuration = ((Date.now() - photoStartTime) / 1000).toFixed(2);
      logger.info(`[Trip ${trip.id}] ✅ Photo ${i + 1}/${files.length} uploaded successfully in ${photoDuration}s`);
    } catch (error) {
      failCount++;
      const photoDuration = ((Date.now() - photoStartTime) / 1000).toFixed(2);
      logger.error(`[Trip ${trip.id}] ❌ Photo ${i + 1}/${files.length} (${file.originalname}) failed after ${photoDuration}s`, error);
      // Continue with other photos
    }
  }

  const uploadDuration = ((Date.now() - uploadStartTime) / 1000).toFixed(1);
  logger.info(`[Trip ${trip.id}] 📤 Upload complete: ${successCount} succeeded, ${failCount} failed in ${uploadDuration}s`);

  // Automatically start processing if we have photos
  if (photos.length > 0) {
    logger.info(`[Trip ${trip.id}] 🚀 Auto-starting processing for ${photos.length} photo(s)`);
    processingService.processTrip(trip.id).catch((error) => {
      logger.error(`[Trip ${trip.id}] ❌ Auto-processing failed`, error);
    });
  }

  const response: ApiResponse<{
    trip: typeof trip;
    uploadedCount: number;
    photos: typeof photos;
  }> = {
    success: true,
    data: {
      trip,
      uploadedCount: photos.length,
      photos,
    },
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

  logger.info(`[Trip ${tripId}] 🔄 Processing request received`);

  // Verify trip exists
  const trip = await tripRepo.findById(tripId);
  if (!trip) {
    logger.warn(`[Trip ${tripId}] ❌ Trip not found`);
    throw new AppError('NOT_FOUND', 'Trip not found', 404);
  }

  // Check if trip has photos
  const photos = await photoRepo.findByTrip(tripId);
  if (photos.length === 0) {
    logger.warn(`[Trip ${tripId}] ❌ No photos found for processing`);
    throw new AppError('VALIDATION_ERROR', 'Trip has no photos to process', 400);
  }

  logger.info(`[Trip ${tripId}] 🚀 Starting background processing for ${photos.length} photo(s)`);

  // Start processing asynchronously (don't wait for completion)
  processingService.processTrip(tripId).catch((error) => {
    logger.error(`[Trip ${tripId}] ❌ Background processing failed`, error);
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
 * List all trips
 */
export async function listTrips(req: Request, res: Response): Promise<void> {
  const trips = await tripRepo.findAll();

  const response: ApiResponse<{
    trips: typeof trips;
  }> = {
    success: true,
    data: {
      trips,
    },
  };

  res.json(response);
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

