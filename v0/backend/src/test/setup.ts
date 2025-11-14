import { beforeAll, afterAll } from 'vitest';
import { getPool } from '../database/db';

// Setup test environment variables if not already set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:dev123@localhost:5432/travelback_test';
}

if (!process.env.OPENAI_API_KEY) {
  // Use a dummy key for tests (will be mocked)
  process.env.OPENAI_API_KEY = 'test-key';
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Clean up database after all tests (only if needed)
// Note: Individual test suites handle their own cleanup
// This is a fallback for any remaining test data
afterAll(async () => {
  const pool = getPool();
  try {
    // Only clean up if explicitly needed (tests should clean up themselves)
    // Commented out to avoid interfering with test suites that manage their own cleanup
    // await pool.query('DELETE FROM photos');
    // await pool.query('DELETE FROM day_itineraries');
    // await pool.query('DELETE FROM trips');
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
});

