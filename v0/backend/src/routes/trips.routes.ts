import { Router } from 'express';
import {
  createTrip,
  createTripWithPhotos,
  uploadPhotos,
  processTrip,
  listTrips,
  getTrip,
  getDayItinerary,
  getTripStatusStream,
  deleteTrip,
  deleteAllOtherTrips,
  cancelTripProcessing,
} from '../controllers/trips.controller';
import {
  startNarration,
  getPhotoContext,
  getPhotoQuestions,
  submitNarrationAnswer,
  completeNarration,
  getNarrationState,
} from '../controllers/narration.controller';
import { uploadPhotos as uploadMiddleware } from '../middleware/upload';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

/**
 * GET /api/trips
 * List all trips
 */
router.get('/', asyncHandler(listTrips));

/**
 * POST /api/trips
 * Create a new trip
 */
router.post('/', asyncHandler(createTrip));

/**
 * POST /api/trips/upload
 * Create a new trip and upload photos in one request
 */
router.post('/upload', uploadMiddleware, asyncHandler(createTripWithPhotos));

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

/**
 * POST /api/trips/:id/narration/start
 * Start narration wizard for a trip
 */
router.post('/:tripId/narration/start', asyncHandler(startNarration));

/**
 * GET /api/trips/:id/narration/state
 * Get narration state for a trip
 */
router.get('/:tripId/narration/state', asyncHandler(getNarrationState));

/**
 * GET /api/trips/:id/narration/photos/:photoId/context
 * Get photo context for narration
 */
router.get('/:tripId/narration/photos/:photoId/context', asyncHandler(getPhotoContext));

/**
 * GET /api/trips/:id/narration/photos/:photoId/questions
 * Get questions for a photo
 */
router.get('/:tripId/narration/photos/:photoId/questions', asyncHandler(getPhotoQuestions));

/**
 * POST /api/trips/:id/narration/answer
 * Submit narration answer
 */
router.post('/:tripId/narration/answer', asyncHandler(submitNarrationAnswer));

/**
 * POST /api/trips/:id/narration/complete
 * Complete narration and generate personalized itinerary
 */
router.post('/:tripId/narration/complete', asyncHandler(completeNarration));

/**
 * POST /api/trips/:id/cancel
 * Cancel trip processing
 */
router.post('/:tripId/cancel', asyncHandler(cancelTripProcessing));

/**
 * DELETE /api/trips/:id/others
 * Delete all trips except the specified one
 * Note: This must come before DELETE /:tripId to avoid route conflicts
 */
router.delete('/:tripId/others', asyncHandler(deleteAllOtherTrips));

/**
 * DELETE /api/trips/:id
 * Delete a trip
 */
router.delete('/:tripId', asyncHandler(deleteTrip));

export default router;

