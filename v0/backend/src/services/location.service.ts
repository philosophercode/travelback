import { LocationData } from '../types';
import { logger } from '../utils/logger';

interface NominatimResponse {
  place_id: number;
  licence: string;
  powered_by: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    country?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    neighbourhood?: string;
    road?: string;
    house_number?: string;
    postcode?: string;
    state?: string;
  };
  boundingbox: string[];
}

export class LocationService {
  private readonly nominatimBaseUrl = 'https://nominatim.openstreetmap.org/reverse';

  /**
   * Reverse geocode GPS coordinates to human-readable address
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<LocationData | null> {
    try {
      const url = new URL(this.nominatimBaseUrl);
      url.searchParams.set('lat', latitude.toString());
      url.searchParams.set('lon', longitude.toString());
      url.searchParams.set('format', 'json');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('zoom', '18');

      logger.debug(`Geocoding coordinates: ${latitude}, ${longitude}`);

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'TravelBack/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.statusText}`);
      }

      const data = await response.json() as NominatimResponse;

      if (!data || !data.address) {
        logger.warn('No address data in geocoding response');
        return null;
      }

      const location: LocationData = {
        latitude: parseFloat(data.lat),
        longitude: parseFloat(data.lon),
        source: 'geocoding',
        confidence: 1.0,
      };

      // Extract address components
      const addr = data.address;
      if (addr.country) location.country = addr.country;
      if (addr.city) location.city = addr.city;
      if (addr.town && !location.city) location.city = addr.town;
      if (addr.village && !location.city) location.city = addr.village;
      if (addr.suburb) location.neighborhood = addr.suburb;
      if (addr.neighbourhood && !location.neighborhood) {
        location.neighborhood = addr.neighbourhood;
      }

      // Try to identify landmark from display_name
      const displayName = data.display_name;
      if (displayName) {
        location.fullAddress = displayName;
        // Extract potential landmark (first part before comma)
        const parts = displayName.split(',');
        if (parts.length > 0 && parts[0].trim()) {
          const firstPart = parts[0].trim();
          // If it's not a number (house number), it might be a landmark
          if (!/^\d+/.test(firstPart)) {
            location.landmark = firstPart;
          }
        }
      }

      logger.debug('Geocoding successful', {
        city: location.city,
        country: location.country,
        landmark: location.landmark,
      });

      return location;
    } catch (error) {
      logger.warn('Reverse geocoding failed', error);
      return null;
    }
  }

  /**
   * Get location from GPS coordinates (with fallback to raw coordinates)
   */
  async getLocation(latitude: number, longitude: number): Promise<LocationData> {
    const geocoded = await this.reverseGeocode(latitude, longitude);

    if (geocoded) {
      return geocoded;
    }

    // Fallback: return raw coordinates
    logger.warn('Geocoding failed, using raw coordinates');
    return {
      latitude,
      longitude,
      source: 'exif',
      confidence: 0.5,
    };
  }
}

export const locationService = new LocationService();

