import { getPool } from '../db';
import { NarrationAnswer, CreateNarrationAnswerData } from '../../types';
import { logger } from '../../utils/logger';

export class NarrationAnswerRepository {
  /**
   * Create a narration answer
   */
  async create(data: CreateNarrationAnswerData): Promise<NarrationAnswer> {
    const pool = getPool();
    const query = `
      INSERT INTO narration_answers (
        trip_id, photo_id, day_number, question_id, question_text, answer_text, answer_audio_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await pool.query(query, [
      data.tripId,
      data.photoId,
      data.dayNumber,
      data.questionId,
      data.questionText,
      data.answerText,
      data.answerAudioUrl || null,
    ]);

    return this.mapRowToAnswer(result.rows[0]);
  }

  /**
   * Find all answers for a trip
   */
  async findByTrip(tripId: string): Promise<NarrationAnswer[]> {
    const pool = getPool();
    const query = `
      SELECT * FROM narration_answers
      WHERE trip_id = $1
      ORDER BY day_number ASC, created_at ASC
    `;

    const result = await pool.query(query, [tripId]);
    return result.rows.map((row) => this.mapRowToAnswer(row));
  }

  /**
   * Find answers for a specific day
   */
  async findByDay(tripId: string, dayNumber: number): Promise<NarrationAnswer[]> {
    const pool = getPool();
    const query = `
      SELECT * FROM narration_answers
      WHERE trip_id = $1 AND day_number = $2
      ORDER BY created_at ASC
    `;

    const result = await pool.query(query, [tripId, dayNumber]);
    return result.rows.map((row) => this.mapRowToAnswer(row));
  }

  /**
   * Find answers for a specific photo
   */
  async findByPhoto(photoId: string): Promise<NarrationAnswer[]> {
    const pool = getPool();
    const query = `
      SELECT * FROM narration_answers
      WHERE photo_id = $1
      ORDER BY created_at ASC
    `;

    const result = await pool.query(query, [photoId]);
    return result.rows.map((row) => this.mapRowToAnswer(row));
  }

  /**
   * Map database row to NarrationAnswer entity
   */
  private mapRowToAnswer(row: any): NarrationAnswer {
    return {
      questionId: row.question_id,
      photoId: row.photo_id,
      dayNumber: row.day_number,
      answer: row.answer_text,
      audioUrl: row.answer_audio_url || undefined,
      timestamp: new Date(row.created_at),
    };
  }
}

