import { OpenAIProvider } from './openai-provider';
import { LLMProvider } from './llm-provider';
import { Photo, PhotoDescription, NarrationQuestion } from '../types';
import { logger } from '../utils/logger';

export class NarrationQuestionAgent {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || new OpenAIProvider();
  }

  /**
   * Generate contextual questions for a photo
   * Questions should be specific and help understand the personal context
   */
  async generatePhotoQuestions(
    photo: Photo,
    description: PhotoDescription
  ): Promise<NarrationQuestion[]> {
    try {
      const location = photo.locationCity || photo.locationCountry
        ? `${photo.locationCity || ''}${photo.locationCity && photo.locationCountry ? ', ' : ''}${photo.locationCountry || ''}`
        : 'Unknown location';

      const prompt = `Based on this travel photo analysis, generate 3-5 specific, contextual questions to help understand the personal story behind this moment.

Photo Context:
- Main Subject: ${description.mainSubject}
- Setting: ${description.setting}
- Activities: ${description.activities.join(', ')}
- Mood: ${description.mood}
- Time of Day: ${description.timeOfDay}
- Location: ${location}
${photo.locationLandmark ? `- Landmark: ${photo.locationLandmark}` : ''}
- Notable Details: ${description.notableDetails.join(', ')}

Generate questions that:
1. Ask about personal context (e.g., "Why were you there?", "What brought you to this place?")
2. Ask about activities (e.g., "What were you doing when you took this?", "What happened before/after this photo?")
3. Ask about people/emotions (e.g., "Who were you with?", "How did you feel in this moment?")
4. Ask about location specifics (e.g., "Where exactly was this?", "What was special about this spot?")
5. Ask about the story (e.g., "What's the story behind this photo?", "What made this moment memorable?")

Return ONLY a valid JSON array (no markdown, no code blocks):
[
  {
    "id": "unique-question-id",
    "question": "Specific question text",
    "type": "location" | "activity" | "context" | "emotion" | "people"
  },
  ...
]

Make questions conversational, specific to what's visible, and designed to elicit personal stories. Return only the JSON array, nothing else.`;

      const response = await this.llmProvider.generateText(
        [
          {
            role: 'system',
            content: 'You are a travel storyteller who asks insightful questions to help people narrate their travel experiences.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          jsonMode: true,
          maxTokens: 2000,
        }
      );

      const questions = JSON.parse(response.content) as Array<{
        id: string;
        question: string;
        type: string;
      }>;

      // Map to NarrationQuestion format
      const narrationQuestions: NarrationQuestion[] = questions.map((q, index) => ({
        id: q.id || `q-${photo.id}-${index}`,
        photoId: photo.id,
        dayNumber: photo.dayNumber || 1,
        question: q.question,
        context: {
          photoDescription: description,
          location: {
            city: photo.locationCity || undefined,
            country: photo.locationCountry || undefined,
            landmark: photo.locationLandmark || undefined,
          },
          timeOfDay: description.timeOfDay,
        },
        type: q.type as NarrationQuestion['type'],
      }));

      logger.debug(`Generated ${narrationQuestions.length} questions for photo ${photo.id}`);
      return narrationQuestions;
    } catch (error) {
      logger.error('Failed to generate narration questions', error);
      throw error;
    }
  }

  /**
   * Generate a brief summary of what was detected in the photo
   * This is shown to the user before questions
   */
  async generatePhotoSummary(
    photo: Photo,
    description: PhotoDescription
  ): Promise<string> {
    const location = photo.locationCity || photo.locationCountry
      ? `${photo.locationCity || ''}${photo.locationCity && photo.locationCountry ? ', ' : ''}${photo.locationCountry || ''}`
      : 'an unknown location';

    const activitiesText = description.activities.length > 0
      ? ` You appear to be ${description.activities.join(' or ')}.`
      : '';

    return `Here's what we detected in this image: ${description.mainSubject} in ${description.setting} at ${location}.${activitiesText} The mood is ${description.mood}, and it's ${description.timeOfDay}.`;
  }
}

