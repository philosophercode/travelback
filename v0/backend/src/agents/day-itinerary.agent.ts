import { OpenAIProvider } from './openai-provider';
import { LLMProvider } from './llm-provider';
import { DayItinerarySummary, Photo } from '../types';
import { logger } from '../utils/logger';

export class DayItineraryAgent {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || new OpenAIProvider();
  }

  /**
   * Generate day itinerary summary from photos
   */
  async generateSummary(photos: Photo[]): Promise<DayItinerarySummary> {
    try {
      if (photos.length === 0) {
        throw new Error('No photos provided for day itinerary');
      }

      // Sort photos chronologically
      const sortedPhotos = [...photos].sort((a, b) => {
        const timeA = a.capturedAt?.getTime() || 0;
        const timeB = b.capturedAt?.getTime() || 0;
        return timeA - timeB;
      });

      // Build context from photo descriptions (text only, no images)
      const photoContexts = sortedPhotos
        .map((photo, index) => {
          const time = photo.capturedAt
            ? new Date(photo.capturedAt).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'Unknown time';
          const location = photo.locationCity
            ? `${photo.locationCity}${photo.locationLandmark ? ` (${photo.locationLandmark})` : ''}`
            : 'Unknown location';
          
          // Use full text description from Step 1 (no images)
          if (!photo.description) {
            return `Photo ${index + 1} (${time}): ${location}\nNo description available`;
          }

          const desc = photo.description;
          const descriptionParts = [
            `Main Subject: ${desc.mainSubject}`,
            `Setting: ${desc.setting}`,
            `Mood: ${desc.mood}`,
            `Time of Day: ${desc.timeOfDay}`,
            `Weather: ${desc.weather}`,
            `Activities: ${desc.activities.join(', ')}`,
            desc.notableDetails && desc.notableDetails.length > 0
              ? `Notable Details: ${desc.notableDetails.join(', ')}`
              : null,
            `Visual Quality: ${desc.visualQuality}`,
          ].filter(Boolean);

          return `Photo ${index + 1} (${time}): ${location}\n${descriptionParts.join('\n')}`;
        })
        .join('\n\n');

      // Calculate approximate distance (simplified)
      const totalDistance = this.calculateDistance(sortedPhotos);

      const prompt = `Based on the following photos from a travel day, create a narrative summary of the day's activities.

Photos:
${photoContexts}

Return a JSON object with the following structure:
{
  "title": "A catchy title for this day (e.g., 'Exploring Historic Paris')",
  "narrative": "A flowing narrative paragraph (3-5 sentences) describing the day's journey, activities, and highlights. Write in past tense, as if telling a story.",
  "highlights": ["array", "of", "3-5", "key", "highlights", "from", "the", "day"],
  "locations": ["array", "of", "all", "locations", "visited"],
  "activities": ["array", "of", "activities", "done", "during", "the", "day"],
  "startTime": "Start time in format like '07:30 AM'",
  "endTime": "End time in format like '10:00 PM'",
  "totalDistance": ${totalDistance.toFixed(1)}
}

Make the narrative engaging and descriptive. Capture the essence of the day's experience.`;

      const response = await this.llmProvider.generateText(
        [
          {
            role: 'system',
            content:
              'You are a travel writer who creates engaging narrative summaries of travel experiences based on photo descriptions.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          jsonMode: true,
          maxTokens: 5000, // Large limit to prevent truncation
        }
      );

      const summary = JSON.parse(response.content) as DayItinerarySummary;

      // Validate structure
      this.validateSummary(summary);

      logger.debug('Generated day itinerary summary', {
        title: summary.title,
        highlightsCount: summary.highlights.length,
      });

      return summary;
    } catch (error) {
      logger.error('Failed to generate day itinerary summary', error);
      throw error;
    }
  }

  /**
   * Calculate approximate distance traveled (simplified)
   */
  private calculateDistance(photos: Photo[]): number {
    if (photos.length < 2) {
      return 0;
    }

    let totalDistance = 0;
    for (let i = 1; i < photos.length; i++) {
      const prev = photos[i - 1];
      const curr = photos[i];

      if (
        prev.locationLatitude &&
        prev.locationLongitude &&
        curr.locationLatitude &&
        curr.locationLongitude
      ) {
        const distance = this.haversineDistance(
          prev.locationLatitude,
          prev.locationLongitude,
          curr.locationLatitude,
          curr.locationLongitude
        );
        totalDistance += distance;
      }
    }

    return totalDistance;
  }

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Validate summary structure
   */
  private validateSummary(summary: DayItinerarySummary): void {
    if (!summary.title || typeof summary.title !== 'string') {
      throw new Error('Invalid summary: missing title');
    }
    if (!summary.narrative || typeof summary.narrative !== 'string') {
      throw new Error('Invalid summary: missing narrative');
    }
    if (!Array.isArray(summary.highlights)) {
      throw new Error('Invalid summary: highlights must be an array');
    }
    if (!Array.isArray(summary.locations)) {
      throw new Error('Invalid summary: locations must be an array');
    }
    if (!Array.isArray(summary.activities)) {
      throw new Error('Invalid summary: activities must be an array');
    }
    if (!summary.startTime || typeof summary.startTime !== 'string') {
      throw new Error('Invalid summary: missing startTime');
    }
    if (!summary.endTime || typeof summary.endTime !== 'string') {
      throw new Error('Invalid summary: missing endTime');
    }
    if (typeof summary.totalDistance !== 'number') {
      throw new Error('Invalid summary: totalDistance must be a number');
    }
  }
}

