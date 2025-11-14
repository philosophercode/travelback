/**
 * LLM Provider interface for abstracting different LLM providers
 */
export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface LLMProvider {
  /**
   * Generate text from messages
   */
  generateText(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    }
  ): Promise<LLMResponse>;

  /**
   * Generate text from image and prompt (vision model)
   */
  generateVisionText(
    image: Buffer,
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    }
  ): Promise<LLMResponse>;
}

