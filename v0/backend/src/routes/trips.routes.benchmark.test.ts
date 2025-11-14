// Set test environment variables before importing app (which imports config)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:dev123@localhost:5432/travelback';
}
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'test-key-for-testing';
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import app from '../app';
import { getPool } from '../database/db';

describe('Benchmark - Photo Upload Performance', () => {
  const sampleTripPath = join(__dirname, '../../../../sample_trip');

  it('should benchmark uploading 5 photos with geocoding', async () => {
    // Create a test trip (don't cleanup until end)
    const createResponse = await request(app)
      .post('/api/trips')
      .send({ name: 'Benchmark Test Trip' });
    
    expect(createResponse.status).toBe(201);
    const tripId = createResponse.body.data.trip.id;

    // Store tripId for cleanup at the end
    let tripIdForCleanup = tripId;

    // Get photos with GPS data (IMG_*.jpeg files) - prioritize those for geocoding benchmark
    const allFiles = readdirSync(sampleTripPath)
      .filter((file) => file.endsWith('.jpeg') || file.endsWith('.jpg'));
    
    // Prioritize IMG files (iPhone photos with GPS), then fill with others
    const imgFiles = allFiles.filter(f => f.startsWith('IMG_'));
    const otherFiles = allFiles.filter(f => !f.startsWith('IMG_'));
    const files = [...imgFiles.slice(0, 3), ...otherFiles.slice(0, 2)].slice(0, 5);

    console.log(`\n📸 Benchmarking upload of ${files.length} photos...`);
    console.log(`Photos: ${files.join(', ')}\n`);

    // Start timing
    const startTime = Date.now();

    // Build request with all photos
    const req = request(app)
      .post(`/api/trips/${tripId}/photos`);

    files.forEach((filename) => {
      const filePath = join(sampleTripPath, filename);
      const buffer = readFileSync(filePath);
      req.attach('photos', buffer, filename);
    });

    // Upload photos
    const uploadResponse = await req.expect(201);
    const uploadTime = Date.now() - startTime;

    expect(uploadResponse.body.success).toBe(true);
    expect(uploadResponse.body.data.uploadedCount).toBe(files.length);

    console.log(`✅ Upload completed in ${uploadTime}ms (${(uploadTime / 1000).toFixed(2)}s)`);
    console.log(`   Average: ${(uploadTime / files.length).toFixed(0)}ms per photo\n`);

    // Check which photos have GPS data
    const photosWithGPS = uploadResponse.body.data.photos.filter(
      (p: any) => p.exifData?.latitude && p.exifData?.longitude
    );
    console.log(`📍 Photos with GPS: ${photosWithGPS.length}/${files.length}`);

    // Poll for location data to complete (query database directly)
    console.log(`\n⏳ Polling for location data...`);
    const locationStartTime = Date.now();
    let allLocationsComplete = false;
    let attempts = 0;
    const maxAttempts = 20; // 20 attempts max
    const pollInterval = 1000; // 1 second between polls

    const uploadedPhotoIds = uploadResponse.body.data.photos.map((p: any) => p.id);
    const photosNeedingLocation = photosWithGPS.map((p: any) => p.id);

    while (!allLocationsComplete && attempts < maxAttempts) {
      attempts++;
      if (attempts > 1) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      // Query database directly for photos
      const pool = getPool();
      const result = await pool.query(
        'SELECT id, location_latitude, location_longitude FROM photos WHERE id = ANY($1)',
        [uploadedPhotoIds]
      );

      const photosWithLocation = result.rows.filter(
        (p: any) => p.location_latitude && p.location_longitude
      );

      const locationCompleteCount = photosWithLocation.length;
      const locationNeededCount = photosNeedingLocation.length;

      console.log(`   Attempt ${attempts}: ${locationCompleteCount}/${locationNeededCount} photos have location data`);

      if (locationCompleteCount === locationNeededCount && locationNeededCount > 0) {
        allLocationsComplete = true;
      } else if (locationNeededCount === 0) {
        // No photos need location, we're done
        allLocationsComplete = true;
      }
    }

    const locationTime = Date.now() - locationStartTime;
    const totalTime = Date.now() - startTime;

    console.log(`\n✅ Location geocoding completed in ${locationTime}ms (${(locationTime / 1000).toFixed(2)}s)`);
    console.log(`   Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`   Polling attempts: ${attempts}\n`);

    // Verify results
    if (photosWithGPS.length > 0) {
      expect(allLocationsComplete).toBe(true);
    }

    // Cleanup (use stored tripId)
    const pool = getPool();
    await pool.query('DELETE FROM photos WHERE trip_id = $1', [tripIdForCleanup]);
    await pool.query('DELETE FROM trips WHERE id = $1', [tripIdForCleanup]);

    // Log summary
    console.log('📊 Benchmark Summary:');
    console.log(`   Upload time: ${uploadTime}ms`);
    console.log(`   Location time: ${locationTime}ms`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Photos with GPS: ${photosWithGPS.length}`);
    console.log(`   Polling attempts: ${attempts}\n`);
  }, 120000); // 2 minute timeout for benchmark
});

