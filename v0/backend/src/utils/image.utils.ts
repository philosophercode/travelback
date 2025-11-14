import sharp from 'sharp';
import { logger } from './logger';

export interface ResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // JPEG quality 1-100
  format?: 'jpeg' | 'png' | 'webp';
}

/**
 * Resize an image buffer while maintaining aspect ratio
 * Returns a resized buffer optimized for AI processing
 */
export async function resizeImageForProcessing(
  imageBuffer: Buffer,
  options: ResizeOptions = {}
): Promise<Buffer> {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    quality = 85,
    format = 'jpeg',
  } = options;

  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    // If image is already smaller than max dimensions, return original
    if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
      logger.debug(`Image already within limits (${originalWidth}x${originalHeight}), skipping resize`);
      return imageBuffer;
    }

    logger.debug(
      `Resizing image from ${originalWidth}x${originalHeight} to max ${maxWidth}x${maxHeight}`
    );

    // Resize maintaining aspect ratio
    const resized = image
      .resize(maxWidth, maxHeight, {
        fit: 'inside', // Maintain aspect ratio, fit within dimensions
        withoutEnlargement: true, // Don't enlarge if smaller
      })
      .toFormat(format, {
        quality,
        mozjpeg: format === 'jpeg', // Better JPEG compression
      });

    const resizedBuffer = await resized.toBuffer();
    const resizedMetadata = await sharp(resizedBuffer).metadata();
    
    logger.debug(
      `Resized image to ${resizedMetadata.width}x${resizedMetadata.height} ` +
      `(${((resizedBuffer.length / imageBuffer.length) * 100).toFixed(1)}% of original size)`
    );

    return resizedBuffer;
  } catch (error) {
    logger.warn('Failed to resize image, using original', error);
    // If resize fails, return original buffer
    return imageBuffer;
  }
}

