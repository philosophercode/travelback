import { getPool } from '../db';
import {
  Photo,
  CreatePhotoData,
  PhotoDescription,
  LocationData,
  ProcessingStatus,
  EXIFData,
} from '../../types';
import { logger } from '../../utils/logger';

/**
 * Sanitize EXIF data by removing null bytes from strings
 * PostgreSQL cannot store null bytes (\u0000) in JSON/text fields
 */
function sanitizeExifData(exifData: EXIFData | undefined): EXIFData | null {
  if (!exifData) {
    return null;
  }

  const sanitized: EXIFData = {};

  for (const [key, value] of Object.entries(exifData)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string') {
      // Remove null bytes from strings
      sanitized[key] = value.replace(/\u0000/g, '');
    } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // Recursively sanitize nested objects
      const nestedSanitized = sanitizeExifData(value as EXIFData);
      if (nestedSanitized) {
        sanitized[key] = nestedSanitized;
      }
    } else {
      // Keep other types as-is (numbers, arrays, dates, etc.)
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export class PhotoRepository {
  /**
   * Create a new photo
   */
  async create(data: CreatePhotoData): Promise<Photo> {
    const pool = getPool();
    const query = `
      INSERT INTO photos (
        trip_id, filename, file_path, file_url, captured_at, exif_data
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const sanitizedExifData = sanitizeExifData(data.exifData);
    const result = await pool.query(query, [
      data.tripId,
      data.filename,
      data.filePath,
      data.fileUrl || null,
      data.capturedAt || null,
      sanitizedExifData ? JSON.stringify(sanitizedExifData) : null,
    ]);

    return this.mapRowToPhoto(result.rows[0]);
  }

  /**
   * Create multiple photos (bulk insert)
   */
  async createMany(photos: CreatePhotoData[]): Promise<Photo[]> {
    if (photos.length === 0) {
      return [];
    }

    const pool = getPool();
    const values: unknown[] = [];
    const placeholders: string[] = [];

    photos.forEach((photo, index) => {
      const base = index * 6;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
      );
      const sanitizedExifData = sanitizeExifData(photo.exifData);
      values.push(
        photo.tripId,
        photo.filename,
        photo.filePath,
        photo.fileUrl || null,
        photo.capturedAt || null,
        sanitizedExifData ? JSON.stringify(sanitizedExifData) : null
      );
    });

    const query = `
      INSERT INTO photos (
        trip_id, filename, file_path, file_url, captured_at, exif_data
      )
      VALUES ${placeholders.join(', ')}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows.map((row) => this.mapRowToPhoto(row));
  }

  /**
   * Find photo by ID
   */
  async findById(id: string): Promise<Photo | null> {
    const pool = getPool();
    const query = 'SELECT * FROM photos WHERE id = $1';

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToPhoto(result.rows[0]);
  }

  /**
   * Find all photos for a trip
   */
  async findByTrip(tripId: string): Promise<Photo[]> {
    const pool = getPool();
    const query = `
      SELECT * FROM photos
      WHERE trip_id = $1
      ORDER BY captured_at ASC NULLS LAST, uploaded_at ASC
    `;

    const result = await pool.query(query, [tripId]);
    return result.rows.map((row) => this.mapRowToPhoto(row));
  }

  /**
   * Find photos for a specific day
   */
  async findByDay(tripId: string, dayNumber: number): Promise<Photo[]> {
    const pool = getPool();
    const query = `
      SELECT * FROM photos
      WHERE trip_id = $1 AND day_number = $2
      ORDER BY captured_at ASC NULLS LAST
    `;

    const result = await pool.query(query, [tripId, dayNumber]);
    return result.rows.map((row) => this.mapRowToPhoto(row));
  }

  /**
   * Update photo description
   */
  async updateDescription(id: string, description: PhotoDescription): Promise<void> {
    const pool = getPool();
    const query = `
      UPDATE photos
      SET description = $1, updated_at = NOW()
      WHERE id = $2
    `;

    await pool.query(query, [JSON.stringify(description), id]);
  }

  /**
   * Update photo location
   */
  async updateLocation(id: string, location: LocationData): Promise<void> {
    const pool = getPool();
    const query = `
      UPDATE photos
      SET
        location_latitude = $1,
        location_longitude = $2,
        location_country = $3,
        location_city = $4,
        location_neighborhood = $5,
        location_landmark = $6,
        location_full_address = $7,
        location_source = $8,
        location_confidence = $9,
        updated_at = NOW()
      WHERE id = $10
    `;

    await pool.query(query, [
      location.latitude,
      location.longitude,
      location.country || null,
      location.city || null,
      location.neighborhood || null,
      location.landmark || null,
      location.fullAddress || null,
      location.source,
      location.confidence || null,
      id,
    ]);
  }

  /**
   * Update photo day number
   */
  async updateDayNumber(id: string, dayNumber: number): Promise<void> {
    const pool = getPool();
    const query = `
      UPDATE photos
      SET day_number = $1, updated_at = NOW()
      WHERE id = $2
    `;

    await pool.query(query, [dayNumber, id]);
  }

  /**
   * Update processing status
   */
  async updateProcessingStatus(
    id: string,
    status: ProcessingStatus
  ): Promise<void> {
    const pool = getPool();
    const query = `
      UPDATE photos
      SET processing_status = $1, updated_at = NOW()
      WHERE id = $2
    `;

    await pool.query(query, [status, id]);
  }

  /**
   * Map database row to Photo entity
   */
  private mapRowToPhoto(row: any): Photo {
    return {
      id: row.id,
      tripId: row.trip_id,
      filename: row.filename,
      filePath: row.file_path,
      fileUrl: row.file_url,
      capturedAt: row.captured_at ? new Date(row.captured_at) : null,
      uploadedAt: new Date(row.uploaded_at),
      dayNumber: row.day_number,
      description: row.description,
      locationLatitude: row.location_latitude
        ? parseFloat(row.location_latitude)
        : null,
      locationLongitude: row.location_longitude
        ? parseFloat(row.location_longitude)
        : null,
      locationCountry: row.location_country,
      locationCity: row.location_city,
      locationNeighborhood: row.location_neighborhood,
      locationLandmark: row.location_landmark,
      locationFullAddress: row.location_full_address,
      locationSource: row.location_source,
      locationConfidence: row.location_confidence
        ? parseFloat(row.location_confidence)
        : null,
      exifData: row.exif_data,
      processingStatus: row.processing_status as ProcessingStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

