import { OpenAIProvider } from './openai-provider';
import { LLMProvider } from './llm-provider';
import { PhotoDescription, EXIFData } from '../types';
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

