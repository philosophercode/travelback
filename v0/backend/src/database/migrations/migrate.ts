import { runMigrations } from './runner';
import { logger } from '../../utils/logger';

async function migrate(): Promise<void> {
  try {
    await runMigrations();
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', error);
    process.exit(1);
  }
}

migrate();

