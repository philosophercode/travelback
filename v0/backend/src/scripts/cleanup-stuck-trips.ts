#!/usr/bin/env tsx
/**
 * Manual cleanup script to mark stuck trips as failed
 * Usage: tsx src/scripts/cleanup-stuck-trips.ts [thresholdMinutes]
 */

import { cleanupService } from '../services/cleanup.service';
import { logger } from '../utils/logger';
import { testConnection, closePool } from '../database/db';

async function main() {
  const thresholdMinutes = process.argv[2] ? parseInt(process.argv[2], 10) : 30;

  if (isNaN(thresholdMinutes) || thresholdMinutes < 0) {
    console.error('Invalid threshold. Please provide a positive number of minutes.');
    process.exit(1);
  }

  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting.');
      process.exit(1);
    }

    logger.info(`Running cleanup for trips stuck in processing status for more than ${thresholdMinutes} minutes...`);
    
    const fixedCount = await cleanupService.cleanupStuckTrips(thresholdMinutes);
    
    if (fixedCount > 0) {
      logger.info(`✅ Cleanup complete: ${fixedCount} trip(s) marked as failed`);
    } else {
      logger.info('✅ No stuck trips found');
    }

    await closePool();
    process.exit(0);
  } catch (error) {
    logger.error('Cleanup script failed', error);
    await closePool();
    process.exit(1);
  }
}

main();

