import { OpenAIProvider } from './openai-provider';
import { LLMProvider } from './llm-provider';
import { TripOverview, DayItinerary, Photo } from '../types';
import { logger } from '../utils/logger';

export class TripOverviewAgent {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || new OpenAIProvider();
  }

  /**
   * Generate trip overview from day itineraries
   */
  async generateOverview(
    dayItineraries: DayItinerary[],
    photos: Photo[]
  ): Promise<TripOverview> {
    try {
      if (dayItineraries.length === 0) {
        throw new Error('No day itineraries provided for trip overview');
      }

      // Sort itineraries by day number
      const sortedItineraries = [...dayItineraries].sort(
        (a, b) => a.dayNumber - b.dayNumber
      );

      // Build context from day summaries
      const dayContexts = sortedItineraries
        .map((itinerary) => {
          const day = itinerary.dayNumber;
          const summary = itinerary.summary;
          return `Day ${day} (${itinerary.date.toISOString().split('T')[0]}): ${summary.title}
Highlights: ${summary.highlights.join(', ')}
Locations: ${summary.locations.join(', ')}
Activities: ${summary.activities.join(', ')}`;
        })
        .join('\n\n');

      // Extract unique destinations
      const destinations = this.extractDestinations(sortedItineraries, photos);

      const prompt = `Based on the following day-by-day summaries from a travel trip, create a comprehensive trip overview.

Day Summaries:
${dayContexts}

Return a JSON object with the following structure:
{
  "title": "A compelling title for the entire trip (e.g., 'A Week in Paris')",
  "summary": "A comprehensive 2-3 paragraph summary of the entire trip, capturing the overall experience, themes, and highlights. Write in past tense, as if telling a story.",
  "destinations": [
    {
      "name": "Destination name (e.g., 'Paris, France')",
      "days": [1, 2, 3],
      "highlights": ["key", "highlights", "from", "this", "destination"]
    }
  ],
  "themes": ["array", "of", "3-5", "themes", "that", "characterize", "this", "trip", "(e.g.,", "culture,", "adventure,", "relaxation)"],
  "totalDays": ${sortedItineraries.length},
  "totalPhotos": ${photos.length},
  "topMoments": ["array", "of", "5-7", "most", "memorable", "moments", "from", "the", "trip"],
  "travelStyle": "A brief description of the travel style (e.g., 'Cultural immersion with urban exploration')"
}

Make the summary engaging and capture the essence of the entire journey.`;

      const response = await this.llmProvider.generateText(
        [
          {
            role: 'system',
            content:
              'You are a travel writer who creates comprehensive overviews of travel experiences based on day-by-day summaries.',
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

      const overview = JSON.parse(response.content) as TripOverview;

      // Override destinations with extracted data
      overview.destinations = destinations;
      overview.totalDays = sortedItineraries.length;
      overview.totalPhotos = photos.length;

      // Validate structure
      this.validateOverview(overview);

      logger.debug('Generated trip overview', {
        title: overview.title,
        destinationsCount: overview.destinations.length,
      });

      return overview;
    } catch (error) {
      logger.error('Failed to generate trip overview', error);
      throw error;
    }
  }

  /**
   * Extract destinations from itineraries and photos
   */
  private extractDestinations(
    itineraries: DayItinerary[],
    photos: Photo[]
  ): Array<{ name: string; days: number[]; highlights: string[] }> {
    const destinationMap = new Map<
      string,
      { days: Set<number>; highlights: Set<string> }
    >();

    // Process each itinerary
    itineraries.forEach((itinerary) => {
      const locations = itinerary.summary.locations;
      const highlights = itinerary.summary.highlights;

      locations.forEach((location) => {
        // Try to identify city/country from location
        const city = photos.find(
          (p) =>
            p.locationCity &&
            (p.locationCity.includes(location) || location.includes(p.locationCity))
        );

        const destinationName = city
          ? `${city.locationCity}, ${city.locationCountry || 'Unknown'}`
          : location;

        if (!destinationMap.has(destinationName)) {
          destinationMap.set(destinationName, {
            days: new Set(),
            highlights: new Set(),
          });
        }

        const dest = destinationMap.get(destinationName)!;
        dest.days.add(itinerary.dayNumber);
        highlights.forEach((h) => dest.highlights.add(h));
      });
    });

    // Convert to array format
    return Array.from(destinationMap.entries()).map(([name, data]) => ({
      name,
      days: Array.from(data.days).sort((a, b) => a - b),
      highlights: Array.from(data.highlights).slice(0, 5), // Limit to 5 highlights
    }));
  }

  /**
   * Validate overview structure
   */
  private validateOverview(overview: TripOverview): void {
    if (!overview.title || typeof overview.title !== 'string') {
      throw new Error('Invalid overview: missing title');
    }
    if (!overview.summary || typeof overview.summary !== 'string') {
      throw new Error('Invalid overview: missing summary');
    }
    if (!Array.isArray(overview.destinations)) {
      throw new Error('Invalid overview: destinations must be an array');
    }
    if (!Array.isArray(overview.themes)) {
      throw new Error('Invalid overview: themes must be an array');
    }
    if (typeof overview.totalDays !== 'number') {
      throw new Error('Invalid overview: totalDays must be a number');
    }
    if (typeof overview.totalPhotos !== 'number') {
      throw new Error('Invalid overview: totalPhotos must be a number');
    }
    if (!Array.isArray(overview.topMoments)) {
      throw new Error('Invalid overview: topMoments must be an array');
    }
  }
}

