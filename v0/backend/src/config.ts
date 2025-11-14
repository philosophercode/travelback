import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  database: {
    url: string;
  };
  openai: {
    apiKey: string;
    textModel: string;
    visionModel: string;
    temperature: number;
    maxTokens: number;
  };
  storage: {
    provider: 'local' | 'supabase';
    uploadDir: string;
    maxFileSizeMB: number;
  };
  processing: {
    maxConcurrentPhotos: number;
  };
}

/**
 * Validate that all required environment variables are set
 */
function validateRequiredEnvVars(): void {
  const required = ['DATABASE_URL', 'OPENAI_API_KEY'];
  const missing: string[] = [];

  required.forEach((name) => {
    if (!process.env[name]) {
      missing.push(name);
    }
  });

  if (missing.length > 0) {
    const message = `Missing required environment variables:\n${missing.map((name) => `  - ${name}`).join('\n')}\n\nPlease check your .env file or set these variables.`;
    throw new Error(message);
  }
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || defaultValue!;
}

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

function getEnvFloat(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

// Validate required environment variables before creating config
validateRequiredEnvVars();

export const config: Config = {
  port: getEnvNumber('PORT', 3000),
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  database: {
    url: getEnvVar('DATABASE_URL'),
  },
  openai: {
    apiKey: getEnvVar('OPENAI_API_KEY'),
    textModel: getEnvVar('LLM_TEXT_MODEL', 'gpt-4o-mini'),
    visionModel: getEnvVar('LLM_VISION_MODEL', 'gpt-4o-mini'),
    temperature: getEnvFloat('LLM_TEMPERATURE', 0.7),
    maxTokens: getEnvNumber('LLM_MAX_TOKENS', 5000),
  },
  storage: {
    provider: (getEnvVar('STORAGE_PROVIDER', 'local') as 'local' | 'supabase'),
    uploadDir: getEnvVar('UPLOAD_DIR', '../uploads'),
    maxFileSizeMB: getEnvNumber('MAX_FILE_SIZE_MB', 10),
  },
  processing: {
    maxConcurrentPhotos: getEnvNumber('MAX_CONCURRENT_PHOTOS', 3),
  },
};

