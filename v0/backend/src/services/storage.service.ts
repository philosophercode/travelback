import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface StorageProvider {
  save(file: Buffer, filename: string): Promise<string>;
  getUrl(filePath: string): Promise<string>;
  delete(filePath: string): Promise<void>;
}

/**
 * Local filesystem storage provider
 */
class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    // Ensure directory exists
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
      logger.info(`Created storage directory: ${baseDir}`);
    }
  }

  async save(file: Buffer, filename: string): Promise<string> {
    const filePath = join(this.baseDir, filename);
    writeFileSync(filePath, file);
    logger.debug(`Saved file to ${filePath}`);
    return filePath;
  }

  async getUrl(filePath: string): Promise<string> {
    // For local storage, return a relative path or full URL
    // In production, this would be replaced with actual URL
    const filename = filePath.split(/[/\\]/).pop() || '';
    return `/uploads/${filename}`;
  }

  async delete(filePath: string): Promise<void> {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      logger.debug(`Deleted file: ${filePath}`);
    }
  }
}

/**
 * Storage service with provider abstraction
 */
class StorageService {
  private provider: StorageProvider;

  constructor() {
    if (config.storage.provider === 'local') {
      this.provider = new LocalStorageProvider(config.storage.uploadDir);
    } else {
      throw new Error(`Storage provider ${config.storage.provider} not implemented`);
    }
  }

  async save(file: Buffer, filename: string): Promise<string> {
    return this.provider.save(file, filename);
  }

  async getUrl(filePath: string): Promise<string> {
    return this.provider.getUrl(filePath);
  }

  async delete(filePath: string): Promise<void> {
    return this.provider.delete(filePath);
  }

  /**
   * Read file from storage
   */
  readFile(filePath: string): Buffer {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return readFileSync(filePath);
  }
}

export const storageService = new StorageService();

