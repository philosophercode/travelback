import exifr from 'exifr';
import { EXIFData } from '../types';
import { logger } from '../utils/logger';

export class EXIFService {
  /**
   * Extract EXIF metadata from image buffer
   */
  async extractMetadata(imageBuffer: Buffer): Promise<EXIFData | null> {
    try {
      const exif = await exifr.parse(imageBuffer, {
        gps: true,
        exif: true,
        iptc: true,
        ifd0: {},
        ifd1: true,
        translateKeys: true,
        translateValues: false,
        reviveValues: true,
        sanitize: true,
        mergeOutput: true,
      });

      if (!exif) {
        logger.debug('No EXIF data found in image');
        return null;
      }

      // Map to our EXIFData structure
      const exifData: EXIFData = {};

      if (exif.Make) exifData.make = exif.Make;
      if (exif.Model) exifData.model = exif.Model;
      if (exif.DateTimeOriginal) exifData.dateTime = exif.DateTimeOriginal;
      if (exif.CreateDate) exifData.dateTime = exif.CreateDate;
      if (exif.ModifyDate && !exifData.dateTime) exifData.dateTime = exif.ModifyDate;

      // GPS coordinates
      if (exif.latitude !== undefined) exifData.latitude = exif.latitude;
      if (exif.longitude !== undefined) exifData.longitude = exif.longitude;
      if (exif.GPSAltitude !== undefined) exifData.altitude = exif.GPSAltitude;

      // Camera settings
      if (exif.FNumber) exifData.fNumber = exif.FNumber;
      if (exif.ExposureTime) exifData.exposureTime = exif.ExposureTime.toString();
      if (exif.ISO) exifData.iso = exif.ISO;
      if (exif.FocalLength) exifData.focalLength = exif.FocalLength;
      if (exif.LensModel) exifData.lensModel = exif.LensModel;

      // Image dimensions
      if (exif.ImageWidth) exifData.imageWidth = exif.ImageWidth;
      if (exif.ImageHeight) exifData.imageHeight = exif.ImageHeight;
      if (exif.Orientation) exifData.orientation = exif.Orientation;

      // Store raw EXIF for reference
      Object.keys(exif).forEach((key) => {
        if (!exifData[key as keyof EXIFData]) {
          exifData[key] = exif[key];
        }
      });

      logger.debug('Extracted EXIF metadata', {
        hasGPS: !!exifData.latitude,
        hasDateTime: !!exifData.dateTime,
        make: exifData.make,
        model: exifData.model,
      });

      return exifData;
    } catch (error) {
      logger.warn('Failed to extract EXIF metadata', error);
      return null;
    }
  }

  /**
   * Get capture timestamp from EXIF data
   */
  getCaptureDate(exifData: EXIFData | null): Date | null {
    if (!exifData?.dateTime) {
      return null;
    }

    try {
      const date = new Date(exifData.dateTime);
      if (isNaN(date.getTime())) {
        return null;
      }
      return date;
    } catch {
      return null;
    }
  }

  /**
   * Get GPS coordinates from EXIF data
   */
  getGPSCoordinates(exifData: EXIFData | null): { latitude: number; longitude: number } | null {
    if (!exifData || exifData.latitude === undefined || exifData.longitude === undefined) {
      return null;
    }

    return {
      latitude: exifData.latitude,
      longitude: exifData.longitude,
    };
  }
}

export const exifService = new EXIFService();

