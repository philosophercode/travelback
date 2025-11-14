import { Request, Response } from 'express';
import { narrationService } from '../services/narration.service';
import { AppError } from '../middleware/error-handler';
import { ApiResponse, NarrationAnswer } from '../types';
import { logger } from '../utils/logger';

/**
 * Start narration wizard for a trip
 * POST /api/trips/:tripId/narration/start
 */
export async function startNarration(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params;

  try {
    const state = await narrationService.startNarration(tripId);

    const response: ApiResponse<{ state: typeof state }> = {
      success: true,
      data: { state },
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error(`Failed to start narration for trip ${tripId}`, error);
    if (error instanceof Error) {
      throw new AppError('NARRATION_ERROR', error.message, 400);
    }
    throw error;
  }
}

/**
 * Get photo context for narration
 * GET /api/trips/:tripId/narration/photos/:photoId/context
 */
export async function getPhotoContext(req: Request, res: Response): Promise<void> {
  const { tripId, photoId } = req.params;

  try {
    const context = await narrationService.getPhotoContext(tripId, photoId);

    const response: ApiResponse<{ context: typeof context }> = {
      success: true,
      data: { context },
    };

    res.json(response);
  } catch (error) {
    logger.error(`Failed to get photo context for trip ${tripId}, photo ${photoId}`, error);
    if (error instanceof Error) {
      throw new AppError('NOT_FOUND', error.message, 404);
    }
    throw error;
  }
}

/**
 * Get questions for a photo
 * GET /api/trips/:tripId/narration/photos/:photoId/questions
 */
export async function getPhotoQuestions(req: Request, res: Response): Promise<void> {
  const { tripId, photoId } = req.params;

  try {
    const questions = await narrationService.getPhotoQuestions(tripId, photoId);

    const response: ApiResponse<{ questions: typeof questions }> = {
      success: true,
      data: { questions },
    };

    res.json(response);
  } catch (error) {
    logger.error(`Failed to get questions for trip ${tripId}, photo ${photoId}`, error);
    if (error instanceof Error) {
      throw new AppError('NOT_FOUND', error.message, 404);
    }
    throw error;
  }
}

/**
 * Submit narration answer
 * POST /api/trips/:tripId/narration/answer
 */
export async function submitNarrationAnswer(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params;
  const { questionId, questionText, photoId, dayNumber, answer, audioUrl } = req.body;

  if (!questionId || !questionText || !photoId || !dayNumber || !answer) {
    throw new AppError('VALIDATION_ERROR', 'Missing required fields: questionId, questionText, photoId, dayNumber, answer', 400);
  }

  try {
    const narrationAnswer: NarrationAnswer = {
      questionId,
      photoId,
      dayNumber: parseInt(dayNumber, 10),
      answer: typeof answer === 'string' ? answer : String(answer),
      audioUrl,
      timestamp: new Date(),
    };

    await narrationService.submitAnswer(tripId, narrationAnswer, questionText);

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Answer submitted successfully' },
    };

    res.status(201).json(response);
  } catch (error) {
    logger.error(`Failed to submit answer for trip ${tripId}`, error);
    if (error instanceof Error) {
      throw new AppError('NARRATION_ERROR', error.message, 400);
    }
    throw error;
  }
}

/**
 * Complete narration and generate personalized itinerary
 * POST /api/trips/:tripId/narration/complete
 */
export async function completeNarration(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params;

  try {
    await narrationService.completeNarration(tripId);

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Narration completed and personalized itinerary generated' },
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error(`Failed to complete narration for trip ${tripId}`, error);
    if (error instanceof Error) {
      throw new AppError('NARRATION_ERROR', error.message, 400);
    }
    throw error;
  }
}

/**
 * Get narration state
 * GET /api/trips/:tripId/narration/state
 */
export async function getNarrationState(req: Request, res: Response): Promise<void> {
  const { tripId } = req.params;

  try {
    const state = await narrationService.getNarrationState(tripId);

    const response: ApiResponse<{ state: typeof state }> = {
      success: true,
      data: { state },
    };

    res.json(response);
  } catch (error) {
    logger.error(`Failed to get narration state for trip ${tripId}`, error);
    if (error instanceof Error) {
      throw new AppError('NARRATION_ERROR', error.message, 400);
    }
    throw error;
  }
}

