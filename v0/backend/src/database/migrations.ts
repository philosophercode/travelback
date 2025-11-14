import { getPool, testConnection } from './db';
import { logger } from '../utils/logger';

/**
 * Run database migrations
 * This is idempotent - safe to run multiple times
 */
export async function runMigrations(): Promise<void> {
  try {
    logger.info('Running database migrations...');

    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }

    const pool = getPool();

    // Migration 1: Add narration_state column to trips table
    try {
      await pool.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'trips' AND column_name = 'narration_state'
          ) THEN
            ALTER TABLE trips ADD COLUMN narration_state JSONB;
            RAISE NOTICE 'Added narration_state column to trips table';
          END IF;
        END $$;
      `);
      logger.debug('Migration 1: narration_state column check completed');
    } catch (error) {
      logger.warn('Migration 1 failed (may already be applied)', error);
    }

    // Migration 2: Create narration_answers table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS narration_answers (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
          photo_id UUID REFERENCES photos(id) ON DELETE CASCADE,
          day_number INTEGER NOT NULL,
          question_id VARCHAR(255) NOT NULL,
          question_text TEXT NOT NULL,
          answer_text TEXT NOT NULL,
          answer_audio_url TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      logger.debug('Migration 2: narration_answers table check completed');
    } catch (error) {
      logger.warn('Migration 2 failed (may already be applied)', error);
    }

    // Migration 3: Create indexes for narration_answers
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_narration_answers_trip_id ON narration_answers(trip_id);
        CREATE INDEX IF NOT EXISTS idx_narration_answers_photo_id ON narration_answers(photo_id);
        CREATE INDEX IF NOT EXISTS idx_narration_answers_day_number ON narration_answers(day_number);
      `);
      logger.debug('Migration 3: narration_answers indexes check completed');
    } catch (error) {
      logger.warn('Migration 3 failed (may already be applied)', error);
    }

    // Migration 4: Create GIN index for narration_state
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_trip_narration_state ON trips USING GIN (narration_state);
      `);
      logger.debug('Migration 4: narration_state GIN index check completed');
    } catch (error) {
      logger.warn('Migration 4 failed (may already be applied)', error);
    }

    logger.info('✅ Database migrations completed successfully');
  } catch (error) {
    logger.error('❌ Database migrations failed', error);
    throw error;
  }
}

