import { runMigrations } from './migrations';
import { logger } from '../utils/logger';

/**
 * Standalone migration script
 * Can be run manually: npm run db:migrate
 */
async function migrate(): Promise<void> {
  try {
    await runMigrations();
    logger.info('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migrations failed', error);
    process.exit(1);
  }
}

migrate();

