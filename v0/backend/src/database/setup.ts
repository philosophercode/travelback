import { testConnection } from './db';
import { logger } from '../utils/logger';
import { runMigrations } from './migrations/runner';

async function setupDatabase(): Promise<void> {
  try {
    logger.info('Setting up database...');

    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }

    // Run migrations (which will create schema if needed)
    await runMigrations();

    logger.info('Database setup completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Database setup failed', error);
    process.exit(1);
  }
}

setupDatabase();

