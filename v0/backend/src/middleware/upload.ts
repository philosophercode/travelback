import multer from 'multer';
import { Request } from 'express';
import { config } from '../config';
import { AppError } from './error-handler';
import { logger } from '../utils/logger';
import { existsSync, mkdirSync } from 'fs';

// Ensure upload directory exists
const uploadDir = config.storage.uploadDir;
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
  logger.info(`Created upload directory: ${uploadDir}`);
}

// Use memory storage to get file buffers for EXIF extraction
// Files will be saved by the storage service after processing
const storage = multer.memoryStorage();

// File filter
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  // Accept image files only
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(
      'INVALID_FILE_TYPE',
      `File type ${file.mimetype} not allowed. Only images are accepted.`,
      400
    ));
  }
};

// Configure multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.storage.maxFileSizeMB * 1024 * 1024, // Convert MB to bytes
    files: 50, // Max 50 files per request
  },
});

// Middleware for multiple photo uploads
export const uploadPhotos = upload.array('photos', 50);

