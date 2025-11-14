import { getPool } from '../db';
import { DayItinerary, CreateDayItineraryData } from '../../types';

export class ItineraryRepository {
  /**
   * Create a new day itinerary
   */
  async create(data: CreateDayItineraryData): Promise<DayItinerary> {
    const pool = getPool();
    const query = `
      INSERT INTO day_itineraries (trip_id, day_number, date, summary)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (trip_id, day_number)
      DO UPDATE SET
        date = EXCLUDED.date,
        summary = EXCLUDED.summary,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await pool.query(query, [
      data.tripId,
      data.dayNumber,
      data.date,
      JSON.stringify(data.summary),
    ]);

    return this.mapRowToItinerary(result.rows[0]);
  }

  /**
   * Find all day itineraries for a trip
   */
  async findByTrip(tripId: string): Promise<DayItinerary[]> {
    const pool = getPool();
    const query = `
      SELECT * FROM day_itineraries
      WHERE trip_id = $1
      ORDER BY day_number ASC
    `;

    const result = await pool.query(query, [tripId]);
    return result.rows.map((row) => this.mapRowToItinerary(row));
  }

  /**
   * Find day itinerary by trip ID and day number
   */
  async findByDayNumber(tripId: string, dayNumber: number): Promise<DayItinerary | null> {
    const pool = getPool();
    const query = `
      SELECT * FROM day_itineraries
      WHERE trip_id = $1 AND day_number = $2
    `;

    const result = await pool.query(query, [tripId, dayNumber]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToItinerary(result.rows[0]);
  }

  /**
   * Map database row to DayItinerary entity
   */
  private mapRowToItinerary(row: any): DayItinerary {
    return {
      id: row.id,
      tripId: row.trip_id,
      dayNumber: row.day_number,
      date: new Date(row.date),
      summary: row.summary,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

