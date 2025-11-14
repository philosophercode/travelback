import { OpenAIProvider } from './openai-provider';
import { LLMProvider } from './llm-provider';
import { PhotoDescription, EXIFData, LocationData } from '../types';
import { locationService } from '../services/location.service';
import { logger } from '../utils/logger';

export class ImageDescriptionAgent {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || new OpenAIProvider();
  }

  /**
   * Generate structured description for a photo
   */
  async describePhoto(
    image: Buffer,
    exifData: EXIFData | null
  ): Promise<PhotoDescription> {
    try {
      // Build context from EXIF data
      const context = this.buildContext(exifData);

      // Get location if available
      let locationContext = '';
      if (exifData?.latitude && exifData?.longitude) {
        const location = await locationService.getLocation(
          exifData.latitude,
          exifData.longitude
        );
        if (location.city || location.country) {
          locationContext = `\nLocation: ${location.city || ''}${location.city && location.country ? ', ' : ''}${location.country || ''}`;
          if (location.landmark) {
            locationContext += ` (near ${location.landmark})`;
          }
        }
      }

      const prompt = `Analyze this travel photo and provide a structured description in JSON format.

${context}${locationContext}

Return ONLY a valid JSON object (no markdown, no code blocks, just raw JSON) with the following structure:
{
  "mainSubject": "Brief description of the main subject (e.g., 'Eiffel Tower at sunset')",
  "setting": "Description of the setting/environment",
  "activities": ["array", "of", "activities", "visible", "in", "photo"],
  "mood": "The mood or atmosphere of the photo",
  "timeOfDay": "Time of day (e.g., 'Early morning', 'Golden hour', 'Night')",
  "weather": "Weather conditions visible",
  "notableDetails": ["array", "of", "notable", "visual", "details"],
  "visualQuality": "Quality assessment: 'excellent', 'good', 'fair', or 'poor'"
}

Be descriptive and specific. Focus on what makes this photo unique or memorable. Return only the JSON object, nothing else.`;

      const response = await this.llmProvider.generateVisionText(image, prompt, {
        jsonMode: false, // Some vision models don't support JSON mode
        maxTokens: 5000, // Large limit for vision models - images consume many input tokens
      });

      // Parse JSON, handling potential markdown code blocks
      let content = response.content.trim();
      // Remove markdown code blocks if present
      if (content.startsWith('```')) {
        const lines = content.split('\n');
        const firstLine = lines[0];
        if (firstLine.includes('json') || firstLine.includes('JSON')) {
          content = lines.slice(1, -1).join('\n');
        } else {
          content = lines.slice(1, -1).join('\n');
        }
      }
      
      const description = JSON.parse(content) as PhotoDescription;

      // Validate structure
      this.validateDescription(description);

      logger.debug('Generated photo description', {
        mainSubject: description.mainSubject,
      });

      return description;
    } catch (error) {
      logger.error('Failed to generate photo description', error);
      throw error;
    }
  }

  /**
   * Build context string from EXIF data
   */
  private buildContext(exifData: EXIFData | null): string {
    if (!exifData) {
      return 'No EXIF metadata available.';
    }

    const parts: string[] = [];

    if (exifData.make || exifData.model) {
      parts.push(`Camera: ${exifData.make || ''} ${exifData.model || ''}`.trim());
    }

    if (exifData.dateTime) {
      parts.push(`Date: ${exifData.dateTime}`);
    }

    if (exifData.fNumber) {
      parts.push(`Aperture: f/${exifData.fNumber}`);
    }

    if (exifData.exposureTime) {
      parts.push(`Shutter: ${exifData.exposureTime}s`);
    }

    if (exifData.iso) {
      parts.push(`ISO: ${exifData.iso}`);
    }

    return parts.length > 0 ? parts.join('\n') : 'Limited EXIF metadata available.';
  }

  /**
   * Detect location from image content using visual analysis
   * Falls back to geocoding if coordinates can be extracted
   */
  async detectLocationFromImage(
    image: Buffer,
    exifData: EXIFData | null
  ): Promise<LocationData | null> {
    try {
      // First, check if we have GPS coordinates in EXIF
      if (exifData?.latitude && exifData?.longitude) {
        logger.debug('GPS coordinates found in EXIF, using geocoding');
        return await locationService.getLocation(
          exifData.latitude,
          exifData.longitude
        );
      }

      // Build context from EXIF data
      const context = this.buildContext(exifData);

      const prompt = `Analyze this travel photo and identify its location. Look for:
- Landmarks, monuments, or famous buildings
- Street signs, storefronts, or text that indicates location
- Architectural styles that suggest a region or country
- Natural features (mountains, bodies of water, vegetation)
- Any visual clues that indicate the city, country, or region

${context}

Return ONLY a valid JSON object (no markdown, no code blocks, just raw JSON) with the following structure:
{
  "country": "Country name if identifiable (e.g., 'France', 'Italy', 'United States')",
  "city": "City name if identifiable (e.g., 'Paris', 'Rome', 'New York')",
  "neighborhood": "Neighborhood or district if identifiable",
  "landmark": "Specific landmark or place name if visible (e.g., 'Eiffel Tower', 'Colosseum')",
  "fullAddress": "Full address if text is visible in the image",
  "confidence": 0.0-1.0 (confidence level: 1.0 = very certain, 0.5 = somewhat certain, 0.3 = uncertain guess)
}

If you cannot identify the location with reasonable confidence (confidence < 0.3), return:
{
  "country": null,
  "city": null,
  "neighborhood": null,
  "landmark": null,
  "fullAddress": null,
  "confidence": 0.0
}

Be specific and accurate. Only include information you can clearly see or infer from the image. Return only the JSON object, nothing else.`;

      const response = await this.llmProvider.generateVisionText(image, prompt, {
        jsonMode: false,
        maxTokens: 1000,
      });

      // Parse JSON, handling potential markdown code blocks
      let content = response.content.trim();
      if (content.startsWith('```')) {
        const lines = content.split('\n');
        const firstLine = lines[0];
        if (firstLine.includes('json') || firstLine.includes('JSON')) {
          content = lines.slice(1, -1).join('\n');
        } else {
          content = lines.slice(1, -1).join('\n');
        }
      }

      const visualLocation = JSON.parse(content) as {
        country?: string | null;
        city?: string | null;
        neighborhood?: string | null;
        landmark?: string | null;
        fullAddress?: string | null;
        confidence?: number;
      };

      // If confidence is too low or no location identified, return null
      if (
        !visualLocation.confidence ||
        visualLocation.confidence < 0.3 ||
        (!visualLocation.country && !visualLocation.city)
      ) {
        logger.debug('Visual location detection confidence too low or no location found');
        return null;
      }

      // Try to geocode if we have city/country
      if (visualLocation.city && visualLocation.country) {
        try {
          // Use Nominatim forward geocoding to get coordinates
          const geocoded = await this.geocodeLocation(
            visualLocation.city,
            visualLocation.country,
            visualLocation.landmark
          );

          if (geocoded) {
            logger.debug('Successfully geocoded visual location', {
              city: visualLocation.city,
              country: visualLocation.country,
            });
            return {
              ...geocoded,
              source: 'llm_visual',
              confidence: visualLocation.confidence,
            };
          }
        } catch (error) {
          logger.warn('Failed to geocode visual location', error);
        }
      }

      // If geocoding failed, we can't provide coordinates
      // Return null since LocationData requires coordinates
      // The location info could be stored separately, but for now we require coordinates
      logger.debug('Visual location detected but geocoding failed', {
        city: visualLocation.city,
        country: visualLocation.country,
      });

      return null;
    } catch (error) {
      logger.warn('Visual location detection failed', error);
      return null;
    }
  }

  /**
   * Forward geocode a location name to get coordinates
   */
  private async geocodeLocation(
    city: string,
    country: string,
    landmark?: string | null
  ): Promise<LocationData | null> {
    try {
      const query = landmark
        ? `${landmark}, ${city}, ${country}`
        : `${city}, ${country}`;

      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'TravelBack/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        return null;
      }

      const result = data[0];
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        country: result.address?.country || country,
        city: result.address?.city || result.address?.town || city,
        neighborhood: result.address?.suburb || result.address?.neighbourhood,
        landmark: landmark || undefined,
        fullAddress: result.display_name,
        source: 'llm_visual',
        confidence: 0.7, // Moderate confidence for forward geocoding
      };
    } catch (error) {
      logger.warn('Forward geocoding failed', error);
      return null;
    }
  }

  /**
   * Validate description structure
   */
  private validateDescription(description: PhotoDescription): void {
    if (!description.mainSubject || typeof description.mainSubject !== 'string') {
      throw new Error('Invalid description: missing mainSubject');
    }
    if (!description.setting || typeof description.setting !== 'string') {
      throw new Error('Invalid description: missing setting');
    }
    if (!Array.isArray(description.activities)) {
      throw new Error('Invalid description: activities must be an array');
    }
    if (!description.mood || typeof description.mood !== 'string') {
      throw new Error('Invalid description: missing mood');
    }
    if (!description.timeOfDay || typeof description.timeOfDay !== 'string') {
      throw new Error('Invalid description: missing timeOfDay');
    }
    if (!description.weather || typeof description.weather !== 'string') {
      throw new Error('Invalid description: missing weather');
    }
    if (!Array.isArray(description.notableDetails)) {
      throw new Error('Invalid description: notableDetails must be an array');
    }
    if (!description.visualQuality || typeof description.visualQuality !== 'string') {
      throw new Error('Invalid description: missing visualQuality');
    }
  }
}

