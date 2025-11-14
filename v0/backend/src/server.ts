import { config } from './config';
import { logger } from './utils/logger';
import { testConnection, closePool } from './database/db';
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

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
    });

    // Handle server errors (e.g., port already in use)
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use. Please stop the process using this port or change the PORT in your .env file.`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });

    return server;
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

