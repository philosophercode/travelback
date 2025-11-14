import { readdir, readFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { getPool, testConnection } from '../db';
import { logger } from '../../utils/logger';

const readdirAsync = promisify(readdir);

const MIGRATIONS_TABLE = 'schema_migrations';

/**
 * Create the migrations tracking table if it doesn't exist
 */
async function ensureMigrationsTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(): Promise<string[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version`
  );
  return result.rows.map((row) => row.version);
}

/**
 * Record that a migration has been applied
 */
async function recordMigration(version: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO ${MIGRATIONS_TABLE} (version) VALUES ($1) ON CONFLICT DO NOTHING`,
    [version]
  );
}

/**
 * Get migration files from the migrations directory, sorted by name
 */
async function getMigrationFiles(): Promise<string[]> {
  const migrationsDir = join(__dirname);
  const files = await readdirAsync(migrationsDir);
  return files
    .filter((file) => file.endsWith('.sql') && file.startsWith('0'))
    .sort()
    .map((file) => join(migrationsDir, file));
}

/**
 * Extract version from migration filename (e.g., "0001_initial.sql" -> "0001_initial")
 */
function getMigrationVersion(filename: string): string {
  const basename = filename.split('/').pop() || filename;
  return basename.replace('.sql', '');
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  try {
    logger.info('Running database migrations...');

    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }

    // Ensure migrations table exists
    await ensureMigrationsTable();

    // Get applied migrations
    const applied = await getAppliedMigrations();
    logger.debug(`Applied migrations: ${applied.join(', ') || 'none'}`);

    // Get all migration files
    const migrationFiles = await getMigrationFiles();
    logger.debug(`Found ${migrationFiles.length} migration files`);

    if (migrationFiles.length === 0) {
      logger.warn('No migration files found');
      return;
    }

    const pool = getPool();
    let appliedCount = 0;

    for (const migrationFile of migrationFiles) {
      const version = getMigrationVersion(migrationFile);

      // Skip if already applied
      if (applied.includes(version)) {
        logger.debug(`Skipping already applied migration: ${version}`);
        continue;
      }

      logger.info(`Applying migration: ${version}`);

      // Read and execute migration
      const migrationSQL = readFileSync(migrationFile, 'utf-8');

      // Run migration in a transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(migrationSQL);
        await recordMigration(version);
        await client.query('COMMIT');
        logger.info(`✅ Applied migration: ${version}`);
        appliedCount++;
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`Failed to apply migration ${version}`, error);
        throw error;
      } finally {
        client.release();
      }
    }

    if (appliedCount === 0) {
      logger.info('✅ All migrations are up to date');
    } else {
      logger.info(`✅ Applied ${appliedCount} migration(s)`);
    }
  } catch (error) {
    logger.error('Migration failed', error);
    throw error;
  }
}

