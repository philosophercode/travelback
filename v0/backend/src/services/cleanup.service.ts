import { TripRepository } from '../database/repositories/trip.repository';
import { ProcessingStatus } from '../types';
import { logger } from '../utils/logger';

export class CleanupService {
  private tripRepo: TripRepository;

  constructor() {
    this.tripRepo = new TripRepository();
  }

  /**
   * Clean up trips stuck in processing status
   * Marks trips as failed if they've been in processing status for too long
   */
  async cleanupStuckTrips(thresholdMinutes: number = 30): Promise<number> {
    try {
      logger.info(`🧹 Starting cleanup: Finding trips stuck in processing status for more than ${thresholdMinutes} minutes...`);
      
      const stuckTrips = await this.tripRepo.findStuckProcessingTrips(thresholdMinutes);
      
      if (stuckTrips.length === 0) {
        logger.info('🧹 No stuck trips found');
        return 0;
      }

      logger.warn(`🧹 Found ${stuckTrips.length} trip(s) stuck in processing status. Marking as failed...`);

      let fixedCount = 0;
      for (const trip of stuckTrips) {
        try {
          await this.tripRepo.updateProcessingStatus(trip.id, ProcessingStatus.FAILED);
          const stuckDuration = Math.round((Date.now() - trip.updatedAt.getTime()) / 1000 / 60);
          logger.warn(`🧹 Marked trip ${trip.id} as failed (was stuck for ${stuckDuration} minutes)`);
          fixedCount++;
        } catch (error) {
          logger.error(`🧹 Failed to mark trip ${trip.id} as failed`, error);
        }
      }

      logger.info(`🧹 Cleanup complete: ${fixedCount}/${stuckTrips.length} trip(s) marked as failed`);
      return fixedCount;
    } catch (error) {
      logger.error('🧹 Cleanup failed', error);
      return 0;
    }
  }

  /**
   * Start periodic cleanup (runs every hour)
   */
  startPeriodicCleanup(intervalMinutes: number = 60): void {
    logger.info(`🧹 Starting periodic cleanup (every ${intervalMinutes} minutes)`);
    
    // Run immediately on startup
    this.cleanupStuckTrips().catch((error) => {
      logger.error('🧹 Initial cleanup failed', error);
    });

    // Then run periodically
    setInterval(() => {
      this.cleanupStuckTrips().catch((error) => {
        logger.error('🧹 Periodic cleanup failed', error);
      });
    }, intervalMinutes * 60 * 1000);
  }
}

export const cleanupService = new CleanupService();

