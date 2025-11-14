import { getPool } from '../db';
import { Trip, CreateTripData, UpdateTripData, ProcessingStatus, NarrationState } from '../../types';
import { logger } from '../../utils/logger';

export class TripRepository {
  /**
   * Create a new trip
   */
  async create(data: CreateTripData): Promise<Trip> {
    const pool = getPool();
    const query = `
      INSERT INTO trips (name, start_date)
      VALUES ($1, $2)
      RETURNING *
    `;
    
    const result = await pool.query(query, [data.name, data.startDate || null]);
    const row = result.rows[0];
    
    return this.mapRowToTrip(row);
  }

  /**
   * Find all trips
   */
  async findAll(): Promise<Trip[]> {
    const pool = getPool();
    const query = 'SELECT * FROM trips ORDER BY created_at DESC';
    
    const result = await pool.query(query);
    
    return result.rows.map((row) => this.mapRowToTrip(row));
  }

  /**
   * Find trip by ID
   */
  async findById(id: string): Promise<Trip | null> {
    const pool = getPool();
    const query = 'SELECT * FROM trips WHERE id = $1';
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToTrip(result.rows[0]);
  }

  /**
   * Update trip
   */
  async update(id: string, data: UpdateTripData): Promise<Trip> {
    const pool = getPool();
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(data.name);
    }
    if (data.startDate !== undefined) {
      updates.push(`start_date = $${paramCount++}`);
      values.push(data.startDate);
    }
    if (data.endDate !== undefined) {
      updates.push(`end_date = $${paramCount++}`);
      values.push(data.endDate);
    }
    if (data.overview !== undefined) {
      updates.push(`overview = $${paramCount++}`);
      values.push(JSON.stringify(data.overview));
    }
    if (data.processingStatus !== undefined) {
      updates.push(`processing_status = $${paramCount++}`);
      values.push(data.processingStatus);
    }
    if (data.narrationState !== undefined) {
      updates.push(`narration_state = $${paramCount++}`);
      values.push(JSON.stringify(data.narrationState));
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE trips
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error(`Trip with id ${id} not found`);
    }

    return this.mapRowToTrip(result.rows[0]);
  }

  /**
   * Update trip overview
   */
  async updateOverview(id: string, overview: unknown): Promise<void> {
    await this.update(id, { overview: overview as any });
  }

  /**
   * Update processing status
   */
  async updateProcessingStatus(id: string, status: ProcessingStatus): Promise<void> {
    await this.update(id, { processingStatus: status });
  }

  /**
   * Update narration state
   */
  async updateNarrationState(id: string, state: NarrationState): Promise<void> {
    await this.update(id, { narrationState: state });
  }

  /**
   * Find trips stuck in processing status (updated more than threshold minutes ago)
   */
  async findStuckProcessingTrips(thresholdMinutes: number = 30): Promise<Trip[]> {
    const pool = getPool();
    // Use interval multiplication for PostgreSQL compatibility
    const query = `
      SELECT * FROM trips
      WHERE processing_status = $1
        AND updated_at < NOW() - ($2 * INTERVAL '1 minute')
      ORDER BY updated_at ASC
    `;
    
    const result = await pool.query(query, [ProcessingStatus.PROCESSING, thresholdMinutes]);
    
    return result.rows.map((row) => this.mapRowToTrip(row));
  }

  /**
   * Delete a trip by ID
   * Note: Database CASCADE will delete related photos, day itineraries, and narration answers
   * But we need to manually delete photo files from storage
   */
  async delete(id: string): Promise<void> {
    const pool = getPool();
    const query = 'DELETE FROM trips WHERE id = $1';
    
    const result = await pool.query(query, [id]);
    
    if (result.rowCount === 0) {
      throw new Error(`Trip with id ${id} not found`);
    }
  }

  /**
   * Delete multiple trips by IDs
   */
  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const pool = getPool();
    const query = `DELETE FROM trips WHERE id = ANY($1::uuid[])`;
    
    const result = await pool.query(query, [ids]);
    
    return result.rowCount || 0;
  }

  /**
   * Map database row to Trip entity
   */
  private mapRowToTrip(row: any): Trip {
    return {
      id: row.id,
      name: row.name,
      startDate: row.start_date ? new Date(row.start_date) : null,
      endDate: row.end_date ? new Date(row.end_date) : null,
      overview: row.overview,
      processingStatus: row.processing_status as ProcessingStatus,
      narrationState: row.narration_state,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

