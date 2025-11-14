import { config } from './config';
import { logger } from './utils/logger';
import { testConnection, closePool } from './database/db';
import { runMigrations } from './database/migrations';
import { cleanupService } from './services/cleanup.service';
import app from './app';

// Start server
async function startServer(): Promise<void> {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting.');
      process.exit(1);
    }

    // Run migrations
    await runMigrations();

    // Clean up stuck trips on startup
    await cleanupService.cleanupStuckTrips(30);

    // Start periodic cleanup (every hour)
    cleanupService.startPeriodicCleanup(60);

    // Start HTTP server
    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await closePool();
  process.exit(0);
});

startServer();

