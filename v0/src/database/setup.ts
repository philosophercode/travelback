import { readFileSync } from 'fs';
import { join } from 'path';
import { getPool, testConnection } from './db';
import { logger } from '../utils/logger';

async function setupDatabase(): Promise<void> {
  try {
    logger.info('Setting up database...');

    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }

    // Read and execute schema
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    const pool = getPool();
    await pool.query(schema);

    logger.info('Database schema created successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Database setup failed', error);
    process.exit(1);
  }
}

setupDatabase();

