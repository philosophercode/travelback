import { ProcessingStatus, Photo, LocationData, TripOverview } from '../types';
import { TripRepository } from '../database/repositories/trip.repository';
import { PhotoRepository } from '../database/repositories/photo.repository';
import { ItineraryRepository } from '../database/repositories/itinerary.repository';
import { ImageDescriptionAgent } from '../agents/image-description.agent';
import { DayItineraryAgent } from '../agents/day-itinerary.agent';
import { TripOverviewAgent } from '../agents/trip-overview.agent';
import { narrationService } from './narration.service';
import { storageService } from './storage.service';
import { locationService } from './location.service';
import { sseService } from './sse.service';
import { logger } from '../utils/logger';
import { config } from '../config';

export class ProcessingService {
  private tripRepo: TripRepository;
  private photoRepo: PhotoRepository;
  private itineraryRepo: ItineraryRepository;
  private imageDescriptionAgent: ImageDescriptionAgent;
  private dayItineraryAgent: DayItineraryAgent;
  private tripOverviewAgent: TripOverviewAgent;

  constructor() {
    this.tripRepo = new TripRepository();
    this.photoRepo = new PhotoRepository();
    this.itineraryRepo = new ItineraryRepository();
    this.imageDescriptionAgent = new ImageDescriptionAgent();
    this.dayItineraryAgent = new DayItineraryAgent();
    this.tripOverviewAgent = new TripOverviewAgent();
  }

  /**
   * Process a trip: describe photos, cluster by day, generate summaries
   */
  async processTrip(tripId: string): Promise<void> {
    const startTime = Date.now();
    logger.info(`[Trip ${tripId}] 🚀 Starting trip processing pipeline`);

    try {
      // Update trip status
      await this.tripRepo.updateProcessingStatus(tripId, ProcessingStatus.PROCESSING);
      logger.info(`[Trip ${tripId}] ✅ Status updated to PROCESSING`);
      
      // Emit status update via SSE
      sseService.sendToTrip(tripId, {
        type: 'status',
        data: { status: ProcessingStatus.PROCESSING, message: 'Processing started' },
      });

      // Get all photos for the trip
      const photos = await this.photoRepo.findByTrip(tripId);
      logger.info(`[Trip ${tripId}] 📸 Step 1/4: Found ${photos.length} photos to process`);
      
      // Emit progress update
      sseService.sendToTrip(tripId, {
        type: 'progress',
        data: { step: 'photos', total: photos.length, completed: 0, message: `Processing ${photos.length} photos` },
      });

      if (photos.length === 0) {
        throw new Error('No photos found for trip');
      }

      // Step 1: Process each photo (describe + locate)
      logger.info(`[Trip ${tripId}] 📸 Step 1/4: Processing photos (describing and locating)...`);
      const photoStartTime = Date.now();
      await this.processPhotos(photos, tripId);
      const photoDuration = ((Date.now() - photoStartTime) / 1000).toFixed(1);
      logger.info(`[Trip ${tripId}] ✅ Step 1/4: Photo processing completed in ${photoDuration}s`);

      // Refresh photos from database to get updated descriptions
      const updatedPhotos = await this.photoRepo.findByTrip(tripId);
      
      // Verify all photos have descriptions before proceeding
      const photosWithoutDescriptions = updatedPhotos.filter(
        (p) => !p.description && p.processingStatus === ProcessingStatus.COMPLETED
      );
      if (photosWithoutDescriptions.length > 0) {
        logger.warn(
          `[Trip ${tripId}] ⚠️  ${photosWithoutDescriptions.length} photos completed without descriptions`
        );
      }

      const completedPhotos = updatedPhotos.filter(p => p.processingStatus === ProcessingStatus.COMPLETED).length;
      const failedPhotos = updatedPhotos.filter(p => p.processingStatus === ProcessingStatus.FAILED).length;
      logger.info(`[Trip ${tripId}] 📊 Photo processing results: ${completedPhotos} completed, ${failedPhotos} failed`);

      // Emit progress update
      sseService.sendToTrip(tripId, {
        type: 'progress',
        data: { step: 'clustering', message: 'Clustering photos by day' },
      });

      // Step 2: Cluster photos by day (use fresh photo data)
      logger.info(`[Trip ${tripId}] 📅 Step 2/4: Clustering photos by day...`);
      const clusterStartTime = Date.now();
      await this.clusterPhotosByDay(tripId, updatedPhotos);
      const clusterDuration = ((Date.now() - clusterStartTime) / 1000).toFixed(1);
      logger.info(`[Trip ${tripId}] ✅ Step 2/4: Photo clustering completed in ${clusterDuration}s`);

      // Emit progress update
      sseService.sendToTrip(tripId, {
        type: 'progress',
        data: { step: 'itineraries', message: 'Generating day itineraries' },
      });

      // Step 3: Generate day itineraries (ensures all days are processed)
      logger.info(`[Trip ${tripId}] 📝 Step 3/4: Generating day itineraries...`);
      const itineraryStartTime = Date.now();
      await this.generateDayItineraries(tripId);
      const itineraryDuration = ((Date.now() - itineraryStartTime) / 1000).toFixed(1);
      logger.info(`[Trip ${tripId}] ✅ Step 3/4: Day itinerary generation completed in ${itineraryDuration}s`);

      // Emit progress update
      sseService.sendToTrip(tripId, {
        type: 'progress',
        data: { step: 'overview', message: 'Generating trip overview' },
      });

      // Step 4: Generate trip overview (verifies all days have itineraries)
      logger.info(`[Trip ${tripId}] 🎯 Step 4/4: Generating trip overview...`);
      const overviewStartTime = Date.now();
      await this.generateTripOverview(tripId);
      const overviewDuration = ((Date.now() - overviewStartTime) / 1000).toFixed(1);
      logger.info(`[Trip ${tripId}] ✅ Step 4/4: Trip overview generation completed in ${overviewDuration}s`);

      // Update trip status to completed
      await this.tripRepo.updateProcessingStatus(tripId, ProcessingStatus.COMPLETED);
      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`[Trip ${tripId}] ✨ All processing steps completed successfully in ${totalDuration}s`);
      
      // Emit completion event
      sseService.sendToTrip(tripId, {
        type: 'status',
        data: { status: ProcessingStatus.COMPLETED, message: 'Processing completed successfully' },
      });
      
      // Fetch complete trip data for summary
      const completedTrip = await this.tripRepo.findById(tripId);
      const finalPhotos = await this.photoRepo.findByTrip(tripId);
      const itineraries = await this.itineraryRepo.findByTrip(tripId);
      
      logger.info(`[Trip ${tripId}] 📊 Final summary: ${finalPhotos.length} photos, ${itineraries.length} days, trip name: "${completedTrip!.name}"`);
      
      // Emit final summary event with trip data
      sseService.sendToTrip(tripId, {
        type: 'summary',
        data: {
          tripId: completedTrip!.id,
          name: completedTrip!.name,
          startDate: completedTrip!.startDate?.toISOString() || null,
          endDate: completedTrip!.endDate?.toISOString() || null,
          status: completedTrip!.processingStatus,
          totalPhotos: finalPhotos.length,
          totalDays: itineraries.length,
          overview: completedTrip!.overview,
          days: itineraries.map((day) => ({
            dayNumber: day.dayNumber,
            date: day.date.toISOString(),
            title: day.summary.title,
          })),
        },
      });
      
      // If narration is enabled, start the narration wizard
      if (completedTrip!.narrationState?.enabled) {
        logger.info(`[Trip ${tripId}] 📝 Narration enabled, starting narration wizard`);
        narrationService.startNarration(tripId).catch((error) => {
          logger.error(`[Trip ${tripId}] ❌ Failed to start narration wizard`, error);
        });
        
        // Emit narration started event
        sseService.sendToTrip(tripId, {
          type: 'narration_started',
          data: { message: 'Narration wizard ready' },
        });
      }
      
      logger.info(`[Trip ${tripId}] 🎉 Processing pipeline completed successfully`);
    } catch (error) {
      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.error(`[Trip ${tripId}] ❌ Processing failed after ${totalDuration}s`, error);
      await this.tripRepo.updateProcessingStatus(tripId, ProcessingStatus.FAILED);
      
      // Emit failure event
      sseService.sendToTrip(tripId, {
        type: 'status',
        data: {
          status: ProcessingStatus.FAILED,
          message: error instanceof Error ? error.message : 'Processing failed',
        },
      });
      
      throw error;
    }
  }

  /**
   * Process all photos: extract descriptions and locations
   * Waits for ALL photos to complete (success or failure) before returning
   */
  private async processPhotos(photos: Photo[], tripId: string): Promise<void> {
    const maxConcurrent = config.processing.maxConcurrentPhotos;
    const batches: Photo[][] = [];

    logger.info(`[Trip ${tripId}] 📸 Processing ${photos.length} photos in batches of ${maxConcurrent}`);

    // Split into batches
    for (let i = 0; i < photos.length; i += maxConcurrent) {
      batches.push(photos.slice(i, i + maxConcurrent));
    }

    logger.info(`[Trip ${tripId}] 📸 Split into ${batches.length} batch(es)`);

    // Process batches sequentially, waiting for each batch to complete
    let completedCount = 0;
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      logger.info(`[Trip ${tripId}] 📸 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} photos)`);
      
      const batchStartTime = Date.now();
      // Wait for all photos in batch to complete (even if some fail)
      await Promise.allSettled(
        batch.map((photo) => this.processPhoto(photo, tripId))
      );
      const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      
      completedCount += batch.length;
      
      logger.info(`[Trip ${tripId}] 📸 Batch ${batchIndex + 1}/${batches.length} completed in ${batchDuration}s (${completedCount}/${photos.length} total)`);
      
      // Emit progress update
      sseService.sendToTrip(tripId, {
        type: 'progress',
        data: {
          step: 'photos',
          total: photos.length,
          completed: completedCount,
          message: `Processed ${completedCount}/${photos.length} photos`,
        },
      });
    }

    // Verify all photos have been processed (check status)
    const allProcessed = await Promise.all(
      photos.map(async (photo) => {
        const updated = await this.photoRepo.findById(photo.id);
        return updated?.processingStatus === ProcessingStatus.COMPLETED ||
               updated?.processingStatus === ProcessingStatus.FAILED;
      })
    );

    const processedCount = allProcessed.filter(Boolean).length;
    logger.info(`[Trip ${tripId}] 📸 Photo processing complete: ${processedCount}/${photos.length} photos processed`);
  }

  /**
   * Compare two location data sources and return the more specific/reasonable one
   */
  private compareLocations(
    gpsLocation: LocationData,
    visualLocation: LocationData,
    _photo: Photo
  ): LocationData {
    // Calculate specificity scores
    const gpsScore = this.calculateLocationSpecificity(gpsLocation);
    const visualScore = this.calculateLocationSpecificity(visualLocation);

    // Check if locations are reasonably close (within ~1km)
    const distance = this.calculateDistance(
      gpsLocation.latitude,
      gpsLocation.longitude,
      visualLocation.latitude,
      visualLocation.longitude
    );

    const locationsMatch = distance < 1.0; // Within 1km

    // If locations match closely, prefer the more specific one
    if (locationsMatch) {
      if (visualScore > gpsScore) {
        // Visual is more specific, but use GPS coordinates for accuracy
        return {
          ...visualLocation,
          latitude: gpsLocation.latitude, // Prefer GPS coordinates for precision
          longitude: gpsLocation.longitude,
          source: 'llm_visual', // Mark as visual since we're using visual details
          confidence: Math.max(
            visualLocation.confidence || 0.7,
            gpsLocation.confidence || 0.9
          ), // Higher confidence when both agree
        };
      } else {
        // GPS is more specific or equal
        return {
          ...gpsLocation,
          // Enhance with visual landmark if available and GPS doesn't have one
          landmark: gpsLocation.landmark || visualLocation.landmark,
          source: 'geocoding', // GPS-based
          confidence: Math.max(
            gpsLocation.confidence || 0.9,
            visualLocation.confidence || 0.7
          ),
        };
      }
    }

    // Locations don't match - check which is more reasonable
    // If visual has high confidence and identifies a landmark, prefer it
    if (
      visualLocation.confidence &&
      visualLocation.confidence > 0.7 &&
      visualLocation.landmark
    ) {
      // Visual detection found a specific landmark - likely more accurate for the photo
      logger.debug('Visual location has high confidence landmark, preferring visual');
      return visualLocation;
    }

    // If GPS has more specific details (neighborhood, landmark), prefer GPS
    if (gpsScore > visualScore) {
      return gpsLocation;
    }

    // Default: prefer visual if confidence is reasonable, otherwise GPS
    if (visualLocation.confidence && visualLocation.confidence > 0.5) {
      return visualLocation;
    }

    return gpsLocation;
  }

  /**
   * Calculate a specificity score for location data
   * Higher score = more specific
   */
  private calculateLocationSpecificity(location: LocationData): number {
    let score = 0;

    if (location.country) score += 1;
    if (location.city) score += 2;
    if (location.neighborhood) score += 3;
    if (location.landmark) score += 5; // Landmarks are very specific
    if (location.fullAddress) score += 2;

    // Boost score based on confidence
    if (location.confidence) {
      score += location.confidence * 2;
    }

    return score;
  }

  /**
   * Calculate distance between two coordinates in kilometers (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Process a single photo
   */
  private async processPhoto(photo: Photo, tripId: string): Promise<void> {
    const photoStartTime = Date.now();
    try {
      logger.debug(`[Trip ${tripId}] 📷 Processing photo ${photo.id} (${photo.filename})`);

      // Update status
      await this.photoRepo.updateProcessingStatus(photo.id, ProcessingStatus.PROCESSING);

      // Load image file
      const imageBuffer = storageService.readFile(photo.filePath);

      // Generate description
      logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: Generating AI description...`);
      const description = await this.imageDescriptionAgent.describePhoto(
        imageBuffer,
        photo.exifData
      );

      if (description) {
        await this.photoRepo.updateDescription(photo.id, description);
        logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: Description generated (subject: ${description.mainSubject})`);
      } else {
        logger.warn(`[Trip ${tripId}] 📷 Photo ${photo.id}: No description generated`);
      }

      // Update location: compare GPS and visual detection, use the better one
      let finalLocation: LocationData | null = null;

      // Get GPS-based location if available
      let gpsLocation: LocationData | null = null;
      if (photo.locationLatitude && photo.locationLongitude) {
        // Location was set during upload from EXIF, but we can re-geocode to get fresh data
        // or use existing location data
        try {
          logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: Geocoding GPS coordinates...`);
          gpsLocation = await locationService.getLocation(
            photo.locationLatitude,
            photo.locationLongitude
          );
          logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: GPS location found: ${gpsLocation.city || 'Unknown'}, ${gpsLocation.country || 'Unknown'}`);
        } catch (error) {
          logger.warn(`[Trip ${tripId}] 📷 Photo ${photo.id}: Failed to re-geocode GPS location`, error);
        }
      }

      // Try visual location detection
      let visualLocation: LocationData | null = null;
      try {
        logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: Detecting location from image...`);
        visualLocation = await this.imageDescriptionAgent.detectLocationFromImage(
          imageBuffer,
          photo.exifData
        );
        if (visualLocation) {
          logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: Visual location detected: ${visualLocation.city || 'Unknown'}, ${visualLocation.country || 'Unknown'}`);
        }
      } catch (error) {
        logger.warn(`[Trip ${tripId}] 📷 Photo ${photo.id}: Visual location detection failed`, error);
      }

      // Compare and choose the better location
      if (gpsLocation && visualLocation) {
        // Both available - compare specificity and reasonableness
        finalLocation = this.compareLocations(gpsLocation, visualLocation, photo);
        logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: Location comparison - chosen: ${finalLocation.source} (${finalLocation.city || 'Unknown'})`);
      } else if (gpsLocation) {
        // Only GPS available
        finalLocation = gpsLocation;
        logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: Using GPS location`);
      } else if (visualLocation && visualLocation.latitude && visualLocation.longitude) {
        // Only visual available (with coordinates)
        finalLocation = visualLocation;
        logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: Using visual location`);
      }

      // Update location if we have a final location
      if (finalLocation && finalLocation.latitude && finalLocation.longitude) {
        await this.photoRepo.updateLocation(photo.id, finalLocation);
        logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: Location updated - ${finalLocation.city || 'Unknown'}, ${finalLocation.country || 'Unknown'}`);
      } else {
        logger.debug(`[Trip ${tripId}] 📷 Photo ${photo.id}: Location could not be determined`);
      }

      // Mark as completed
      await this.photoRepo.updateProcessingStatus(photo.id, ProcessingStatus.COMPLETED);
      const photoDuration = ((Date.now() - photoStartTime) / 1000).toFixed(1);
      logger.debug(`[Trip ${tripId}] ✅ Photo ${photo.id} processed successfully in ${photoDuration}s`);
    } catch (error) {
      const photoDuration = ((Date.now() - photoStartTime) / 1000).toFixed(1);
      logger.error(`[Trip ${tripId}] ❌ Failed to process photo ${photo.id} after ${photoDuration}s`, error);
      await this.photoRepo.updateProcessingStatus(photo.id, ProcessingStatus.FAILED);
      // Continue processing other photos (graceful degradation)
    }
  }

  /**
   * Cluster photos by day based on capture timestamps
   */
  private async clusterPhotosByDay(tripId: string, photos: Photo[]): Promise<void> {
    logger.info(`[Trip ${tripId}] 📅 Clustering ${photos.length} photos by day`);

    // Group photos by date
    const photosByDate = new Map<string, Photo[]>();

    photos.forEach((photo) => {
      if (!photo.capturedAt) {
        return; // Skip photos without capture date
      }

      const date = new Date(photo.capturedAt);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!photosByDate.has(dateKey)) {
        photosByDate.set(dateKey, []);
      }
      photosByDate.get(dateKey)!.push(photo);
    });

    // Sort dates chronologically
    const sortedDates = Array.from(photosByDate.keys()).sort();

    logger.info(`[Trip ${tripId}] 📅 Found ${sortedDates.length} unique day(s): ${sortedDates.join(', ')}`);

    // Assign day numbers
    sortedDates.forEach((dateKey, index) => {
      const dayNumber = index + 1;
      const dayPhotos = photosByDate.get(dateKey)!;

      logger.info(`[Trip ${tripId}] 📅 Day ${dayNumber}: ${dayPhotos.length} photos from ${dateKey}`);

      // Update day number for all photos in this day
      dayPhotos.forEach((photo) => {
        this.photoRepo.updateDayNumber(photo.id, dayNumber);
      });
    });

    logger.info(`[Trip ${tripId}] ✅ Clustered photos into ${sortedDates.length} day(s)`);
  }

  /**
   * Generate day itineraries for all days
   * Ensures all days are processed before completing
   */
  private async generateDayItineraries(tripId: string): Promise<void> {
    logger.info(`[Trip ${tripId}] 📝 Generating day itineraries...`);

    // Get all photos grouped by day
    const photos = await this.photoRepo.findByTrip(tripId);
    const photosByDay = new Map<number, Photo[]>();

    photos.forEach((photo) => {
      if (photo.dayNumber) {
        if (!photosByDay.has(photo.dayNumber)) {
          photosByDay.set(photo.dayNumber, []);
        }
        photosByDay.get(photo.dayNumber)!.push(photo);
      }
    });

    if (photosByDay.size === 0) {
      logger.warn(`[Trip ${tripId}] ⚠️  No photos with day numbers found, skipping day itinerary generation`);
      return;
    }

    logger.info(`[Trip ${tripId}] 📝 Found ${photosByDay.size} day(s) with photos`);

    // Filter to only photos with descriptions (required for itinerary generation)
    const daysWithDescriptions = new Map<number, Photo[]>();
    for (const [dayNumber, dayPhotos] of photosByDay) {
      const photosWithDescriptions = dayPhotos.filter((p) => p.description !== null);
      if (photosWithDescriptions.length > 0) {
        daysWithDescriptions.set(dayNumber, photosWithDescriptions);
        logger.info(`[Trip ${tripId}] 📝 Day ${dayNumber}: ${photosWithDescriptions.length} photos with descriptions`);
      } else {
        logger.warn(`[Trip ${tripId}] ⚠️  Day ${dayNumber} has no photos with descriptions, skipping`);
      }
    }

    // Generate itinerary for each day sequentially, waiting for all to complete
    const results: Array<{ dayNumber: number; success: boolean; error?: Error }> = [];
    const dayPromises = Array.from(daysWithDescriptions.entries()).map(
      async ([dayNumber, dayPhotos]) => {
        const dayStartTime = Date.now();
        try {
          logger.info(`[Trip ${tripId}] 📝 Day ${dayNumber}: Generating itinerary from ${dayPhotos.length} photos...`);
          
          // Get date from first photo
          const firstPhoto = dayPhotos[0];
          if (!firstPhoto.capturedAt) {
            logger.warn(`[Trip ${tripId}] ⚠️  Day ${dayNumber} has no capture date, skipping`);
            return { dayNumber, success: false, error: new Error('No capture date') };
          }

          const date = new Date(firstPhoto.capturedAt);

          // Generate summary
          const summary = await this.dayItineraryAgent.generateSummary(dayPhotos);

          // Save itinerary
          await this.itineraryRepo.create({
            tripId,
            dayNumber,
            date,
            summary,
          });

          const dayDuration = ((Date.now() - dayStartTime) / 1000).toFixed(1);
          logger.info(`[Trip ${tripId}] ✅ Day ${dayNumber}: Itinerary generated in ${dayDuration}s (title: "${summary.title}")`);
          return { dayNumber, success: true };
        } catch (error) {
          const dayDuration = ((Date.now() - dayStartTime) / 1000).toFixed(1);
          logger.error(`[Trip ${tripId}] ❌ Day ${dayNumber}: Failed to generate itinerary after ${dayDuration}s`, error);
          return { dayNumber, success: false, error: error as Error };
        }
      }
    );

    // Wait for ALL days to complete (success or failure)
    const dayResults = await Promise.allSettled(dayPromises);
    
    // Extract results
    dayResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        logger.error(`[Trip ${tripId}] ❌ Unexpected error in day itinerary promise`, result.reason);
      }
    });

    // Verify all days have been processed by checking database
    const allDaysProcessed = await Promise.all(
      Array.from(daysWithDescriptions.keys()).map(async (dayNumber) => {
        const itinerary = await this.itineraryRepo.findByDayNumber(tripId, dayNumber);
        // Day is considered processed if itinerary exists OR if it failed (we have result)
        return itinerary !== null || results.some((r) => r.dayNumber === dayNumber && !r.success);
      })
    );

    const processedDaysCount = allDaysProcessed.filter(Boolean).length;
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    
    logger.info(
      `[Trip ${tripId}] 📝 Day itinerary generation complete: ${successful} succeeded, ${failed} failed (${processedDaysCount}/${daysWithDescriptions.size} days processed)`
    );

    if (failed > 0 && successful === 0) {
      throw new Error(`All day itinerary generations failed (${failed} days)`);
    }
  }

  /**
   * Generate trip overview
   * Verifies all days have itineraries before generating overview
   */
  private async generateTripOverview(tripId: string): Promise<void> {
    logger.info(`[Trip ${tripId}] 🎯 Generating trip overview...`);

    // Get all day itineraries
    const itineraries = await this.itineraryRepo.findByTrip(tripId);
    const photos = await this.photoRepo.findByTrip(tripId);

    if (itineraries.length === 0) {
      logger.warn(`[Trip ${tripId}] ⚠️  No day itineraries found, skipping trip overview`);
      return;
    }

    // Verify we have itineraries for all days that have photos
    const photosByDay = new Map<number, Photo[]>();
    photos.forEach((photo) => {
      if (photo.dayNumber) {
        if (!photosByDay.has(photo.dayNumber)) {
          photosByDay.set(photo.dayNumber, []);
        }
        photosByDay.get(photo.dayNumber)!.push(photo);
      }
    });

    const daysWithPhotos = Array.from(photosByDay.keys()).sort((a, b) => a - b);
    const daysWithItineraries = itineraries.map((i) => i.dayNumber).sort((a, b) => a - b);
    const missingDays = daysWithPhotos.filter((d) => !daysWithItineraries.includes(d));

    if (missingDays.length > 0) {
      logger.warn(
        `[Trip ${tripId}] ⚠️  Some days have photos but no itineraries: ${missingDays.join(', ')}. Proceeding with available itineraries.`
      );
    }

    logger.info(
      `[Trip ${tripId}] 🎯 Generating overview from ${itineraries.length} day itinerary/ies (days: ${daysWithItineraries.join(', ')})`
    );

    // Generate overview using all available day itineraries
    const overviewStartTime = Date.now();
    const overview = await this.tripOverviewAgent.generateOverview(itineraries, photos);
    const overviewDuration = ((Date.now() - overviewStartTime) / 1000).toFixed(1);

    logger.info(`[Trip ${tripId}] 🎯 Overview generated in ${overviewDuration}s (title: "${overview.title}")`);

    // Calculate trip dates
    const dates = photos
      .map((p) => p.capturedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    // Update trip with overview, dates, and name in a single atomic update
    const updates: { overview?: TripOverview; startDate?: Date; endDate?: Date; name?: string } = {
      overview,
    };
    
    if (dates.length > 0) {
      updates.startDate = dates[0];
      updates.endDate = dates[dates.length - 1];
      logger.info(`[Trip ${tripId}] 📅 Trip dates: ${dates[0].toISOString().split('T')[0]} to ${dates[dates.length - 1].toISOString().split('T')[0]}`);
    }

    // Update trip name with overview title if available
    if (overview.title) {
      updates.name = overview.title;
      logger.info(`[Trip ${tripId}] ✏️  Trip name updated to: "${overview.title}"`);
    }

    // Single atomic update to ensure consistency
    await this.tripRepo.update(tripId, updates);

    logger.info(`[Trip ${tripId}] ✅ Trip overview generated and trip updated`);
  }
}

export const processingService = new ProcessingService();

