import { Router } from 'express';
import {
  createTrip,
  uploadPhotos,
  processTrip,
  getTrip,
  getDayItinerary,
  getTripStatusStream,
} from '../controllers/trips.controller';
import { uploadPhotos as uploadMiddleware } from '../middleware/upload';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

/**
 * POST /api/trips
 * Create a new trip
 */
router.post('/', asyncHandler(createTrip));

/**
 * POST /api/trips/:id/photos
 * Upload photos to a trip
 */
router.post('/:tripId/photos', uploadMiddleware, asyncHandler(uploadPhotos));

/**
 * POST /api/trips/:id/process
 * Trigger AI processing for a trip
 */
router.post('/:tripId/process', asyncHandler(processTrip));

/**
 * GET /api/trips/:id
 * Get trip details with overview and days
 */
router.get('/:tripId', asyncHandler(getTrip));

/**
 * GET /api/trips/:id/days/:dayNumber
 * Get specific day itinerary with photos
 */
router.get('/:tripId/days/:dayNumber', asyncHandler(getDayItinerary));

/**
 * GET /api/trips/:id/status
 * Get trip processing status stream via Server-Sent Events (SSE)
 */
router.get('/:tripId/status', asyncHandler(getTripStatusStream));

export default router;

