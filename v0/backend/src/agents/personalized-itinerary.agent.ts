import { OpenAIProvider } from './openai-provider';
import { LLMProvider } from './llm-provider';
import {
  Photo,
  PhotoDescription,
  DayItinerarySummary,
  TripOverview,
  NarrationAnswer,
  DayItinerary,
} from '../types';
import { logger } from '../utils/logger';

export class PersonalizedItineraryAgent {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || new OpenAIProvider();
  }

  /**
   * Generate personalized day itinerary combining:
   * - Pre-processed photo descriptions
   * - User narration answers
   * - Original day itinerary (for structure)
   */
  async generatePersonalizedDayItinerary(
    dayPhotos: Photo[],
    photoDescriptions: Map<string, PhotoDescription>,
    photoAnswers: Map<string, NarrationAnswer[]>, // photoId -> answers
    originalItinerary: DayItinerarySummary
  ): Promise<DayItinerarySummary> {
    try {
      // Build context from photos + descriptions + answers
      const photoContexts = dayPhotos.map((photo, index) => {
        const desc = photoDescriptions.get(photo.id);
        const answers = photoAnswers.get(photo.id) || [];
        const time = photo.capturedAt
          ? new Date(photo.capturedAt).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })
          : 'Unknown time';
        const location = photo.locationCity
          ? `${photo.locationCity}${photo.locationLandmark ? ` (${photo.locationLandmark})` : ''}`
          : 'Unknown location';

        let context = `Photo ${index + 1} (${time}): ${location}\n`;
        
        if (desc) {
          context += `Detected: ${desc.mainSubject} in ${desc.setting}. Activities: ${desc.activities.join(', ')}. Mood: ${desc.mood}.\n`;
        }

        if (answers.length > 0) {
          context += `Personal Context:\n`;
          answers.forEach((answer) => {
            context += `- ${answer.answer}\n`;
          });
        }

        return context;
      }).join('\n\n');

      const prompt = `Create a personalized narrative summary of this travel day, incorporating both the visual analysis of photos AND the personal context provided by the traveler.

Original Itinerary Summary:
Title: ${originalItinerary.title}
Narrative: ${originalItinerary.narrative}

Photos and Personal Context:
${photoContexts}

Create a NEW personalized narrative that:
1. Incorporates the personal stories and context from the traveler's answers
2. Maintains the chronological flow of the day
3. Adds emotional depth and personal meaning
4. Uses first-person perspective ("I", "we") when appropriate
5. Weaves together the visual elements with the personal narrative

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "title": "Personalized title incorporating the traveler's story",
  "narrative": "Rich, personal narrative paragraph (4-6 sentences) that combines visual elements with personal context. Write in past tense, as if telling a story.",
  "highlights": ["array", "of", "3-5", "personalized", "highlights"],
  "locations": ["array", "of", "all", "locations", "visited"],
  "activities": ["array", "of", "activities", "with", "personal", "context"],
  "startTime": "${originalItinerary.startTime}",
  "endTime": "${originalItinerary.endTime}",
  "totalDistance": ${originalItinerary.totalDistance}
}

Make it personal, engaging, and true to the traveler's experience. Return only the JSON object, nothing else.`;

      const response = await this.llmProvider.generateText(
        [
          {
            role: 'system',
            content: 'You are a travel writer who creates personalized, engaging narratives from photo analysis and personal stories.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          jsonMode: true,
          maxTokens: 5000,
        }
      );

      const summary = JSON.parse(response.content) as DayItinerarySummary;
      
      // Validate structure
      this.validateSummary(summary);

      logger.debug('Generated personalized day itinerary', {
        title: summary.title,
      });

      return summary;
    } catch (error) {
      logger.error('Failed to generate personalized day itinerary', error);
      throw error;
    }
  }

  /**
   * Generate personalized trip overview
   */
  async generatePersonalizedTripOverview(
    dayItineraries: DayItinerary[],
    originalOverview: TripOverview,
    totalPhotos: number
  ): Promise<TripOverview> {
    try {
      const daySummaries = dayItineraries.map((day, index) => {
        return `Day ${day.dayNumber} (${day.date.toISOString().split('T')[0]}): ${day.summary.title}\n${day.summary.narrative}\nHighlights: ${day.summary.highlights.join(', ')}`;
      }).join('\n\n');

      const prompt = `Create a personalized trip overview that incorporates the traveler's personal stories from each day.

Original Overview:
Title: ${originalOverview.title}
Summary: ${originalOverview.summary}

Personalized Day Narratives:
${daySummaries}

Create a NEW personalized trip overview that:
1. Incorporates themes and stories from the personalized day narratives
2. Maintains the structure of the original overview
3. Adds personal meaning and emotional depth
4. Reflects the traveler's unique experience

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "title": "Personalized trip title",
  "summary": "Personal narrative paragraph (5-7 sentences) that captures the essence of the trip with personal context",
  "destinations": ${JSON.stringify(originalOverview.destinations)},
  "themes": ["array", "of", "personalized", "themes"],
  "totalDays": ${dayItineraries.length},
  "totalPhotos": ${totalPhotos},
  "topMoments": ["array", "of", "3-5", "personalized", "top", "moments"],
  "travelStyle": "Personalized description of travel style"
}

Make it personal and engaging. Return only the JSON object, nothing else.`;

      const response = await this.llmProvider.generateText(
        [
          {
            role: 'system',
            content: 'You are a travel writer who creates personalized trip overviews from day narratives.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          jsonMode: true,
          maxTokens: 3000,
        }
      );

      const overview = JSON.parse(response.content) as TripOverview;

      logger.debug('Generated personalized trip overview', {
        title: overview.title,
      });

      return overview;
    } catch (error) {
      logger.error('Failed to generate personalized trip overview', error);
      throw error;
    }
  }

  /**
   * Validate summary structure (reused from DayItineraryAgent)
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

