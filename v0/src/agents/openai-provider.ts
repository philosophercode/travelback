import OpenAI from 'openai';
import { LLMProvider, LLMResponse } from './llm-provider';
import { config } from '../config';
import { logger } from '../utils/logger';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private textModel: string;
  private visionModel: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    this.textModel = config.openai.textModel;
    this.visionModel = config.openai.visionModel;
    this.defaultTemperature = config.openai.temperature;
    this.defaultMaxTokens = config.openai.maxTokens;
  }

  /**
   * Determine which token limit parameter to use based on model
   * Newer models (gpt-5-*, o1-*) use max_completion_tokens
   * Older models use max_tokens
   */
  private getTokenLimitParam(model: string, maxTokens: number): Record<string, number> {
    // Models that require max_completion_tokens
    if (model.includes('gpt-5-') || model.includes('o1-') || model.includes('o3-')) {
      return { max_completion_tokens: maxTokens };
    }
    // Default to max_tokens for older models
    return { max_tokens: maxTokens };
  }

  async generateText(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    }
  ): Promise<LLMResponse> {
    try {
      const temperature = options?.temperature ?? this.defaultTemperature;
      const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;
      const requestParams: any = {
        model: this.textModel,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        ...this.getTokenLimitParam(this.textModel, maxTokens),
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
      };
      
      // Only include temperature if it's 1 (default), as some models only support the default value
      if (temperature === 1) {
        requestParams.temperature = temperature;
      }

      logger.debug('OpenAI text request', {
        model: this.textModel,
        maxTokens,
        hasJsonMode: !!options?.jsonMode,
      });

      const response = await this.client.chat.completions.create(requestParams);

      const choice = response.choices[0];
      if (!choice) {
        logger.error('OpenAI text response has no choices', { response });
        throw new Error('No choices in OpenAI text response');
      }

      if (!choice.message.content) {
        const finishReason = choice.finish_reason;
        logger.error('OpenAI text response has no content', {
          finishReason,
          choice,
          responseId: response.id,
        });
        
        let errorMessage = 'No content in OpenAI text response';
        if (finishReason === 'content_filter') {
          errorMessage = 'Content was filtered by OpenAI safety filters';
        } else if (finishReason === 'length') {
          errorMessage = 'Response was truncated due to token limit';
        } else if (finishReason) {
          errorMessage = `No content in OpenAI text response (finish_reason: ${finishReason})`;
        }
        
        throw new Error(errorMessage);
      }

      logger.debug('OpenAI text generation', {
        model: this.textModel,
        usage: response.usage,
      });

      return {
        content: choice.message.content,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      logger.error('OpenAI text generation failed', error);
      throw error;
    }
  }

  async generateVisionText(
    image: Buffer,
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    }
  ): Promise<LLMResponse> {
    try {
      // Convert buffer to base64
      const base64Image = image.toString('base64');
      const mimeType = 'image/jpeg'; // Assume JPEG, could be detected

      const temperature = options?.temperature ?? this.defaultTemperature;
      const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;
      const requestParams: any = {
        model: this.visionModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        ...this.getTokenLimitParam(this.visionModel, maxTokens),
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
      };
      
      // Only include temperature if it's 1 (default), as some models only support the default value
      if (temperature === 1) {
        requestParams.temperature = temperature;
      }

      logger.debug('OpenAI vision request', {
        model: this.visionModel,
        maxTokens,
        hasJsonMode: !!options?.jsonMode,
        imageSize: base64Image.length,
      });

      const response = await this.client.chat.completions.create(requestParams);

      const choice = response.choices[0];
      if (!choice) {
        logger.error('OpenAI vision response has no choices', { response });
        throw new Error('No choices in OpenAI vision response');
      }

      if (!choice.message.content) {
        const finishReason = choice.finish_reason;
        logger.error('OpenAI vision response has no content', {
          finishReason,
          choice,
          responseId: response.id,
        });
        
        let errorMessage = 'No content in OpenAI vision response';
        if (finishReason === 'content_filter') {
          errorMessage = 'Content was filtered by OpenAI safety filters';
        } else if (finishReason === 'length') {
          errorMessage = 'Response was truncated due to token limit';
        } else if (finishReason) {
          errorMessage = `No content in OpenAI vision response (finish_reason: ${finishReason})`;
        }
        
        throw new Error(errorMessage);
      }

      logger.debug('OpenAI vision generation', {
        model: this.visionModel,
        usage: response.usage,
      });

      return {
        content: choice.message.content,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      logger.error('OpenAI vision generation failed', error);
      throw error;
    }
  }
}

