import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DayItinerary, Photo } from '../types';
import { apiClient } from '../api/client';

interface TripMapProps {
  tripId: string;
  days: DayItinerary[];
  onPhotoHover: (photoId: string | null) => void;
  hoveredPhotoId: string | null;
}

// Fix for default marker icons in react-leaflet
const defaultIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export function TripMap({ tripId, days, onPhotoHover, hoveredPhotoId }: TripMapProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const markerRefs = useRef<Map<string, LeafletMarker>>(new Map());

  useEffect(() => {
    async function loadAllPhotos() {
      try {
        setLoading(true);
        const allPhotos: Photo[] = [];

        // Fetch photos for each day in parallel
        const photoPromises = days.map(async (day) => {
          try {
            const data = await apiClient.fetchDay(tripId, day.dayNumber);
            return data.photos;
          } catch (err) {
            console.error(`Failed to load photos for day ${day.dayNumber}:`, err);
            return [];
          }
        });

        const results = await Promise.all(photoPromises);
        results.forEach((dayPhotos) => {
          allPhotos.push(...dayPhotos);
        });

        setPhotos(allPhotos);
      } catch (err) {
        console.error('Failed to load photos for map:', err);
      } finally {
        setLoading(false);
      }
    }

    if (days.length > 0) {
      loadAllPhotos();
    } else {
      setLoading(false);
    }
  }, [tripId, days]);

  // Open popup when hoveredPhotoId changes
  useEffect(() => {
    if (hoveredPhotoId) {
      const marker = markerRefs.current.get(hoveredPhotoId);
      if (marker) {
        marker.openPopup();
      }
    } else {
      // Close all popups when no photo is hovered
      markerRefs.current.forEach((marker) => {
        marker.closePopup();
      });
    }
  }, [hoveredPhotoId]);

  // Filter photos that have location data
  const photosWithLocation = photos.filter(
    (photo) => photo.locationLatitude !== null && photo.locationLongitude !== null
  );

  if (loading) {
    return (
      <div className="trip-map">
        <p className="loading-text">Loading map...</p>
      </div>
    );
  }

  if (photosWithLocation.length === 0) {
    return (
      <div className="trip-map">
        <h3 className="map-title">Photo Locations</h3>
        <p className="no-locations">No photos with location data available.</p>
      </div>
    );
  }

  // Calculate center and bounds
  const latitudes = photosWithLocation.map((p) => p.locationLatitude!);
  const longitudes = photosWithLocation.map((p) => p.locationLongitude!);
  const centerLat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const centerLng = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;

  const scrollToPhoto = (photoId: string) => {
    const element = document.getElementById(`photo-${photoId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.boxShadow = '0 0 0 4px rgba(25, 118, 210, 0.5)';
      setTimeout(() => {
        element.style.boxShadow = '';
      }, 2000);
    }
  };

  return (
    <div className="trip-map">
      <h3 className="map-title">Photo Locations</h3>
      <p className="map-subtitle">
        {photosWithLocation.length} of {photos.length} photos have location data
      </p>
      <div className="map-container">
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={6}
          className="map-leaflet-container"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {photosWithLocation.map((photo) => (
            <Marker
              key={photo.id}
              position={[photo.locationLatitude!, photo.locationLongitude!]}
              icon={defaultIcon}
              eventHandlers={{
                mouseover: () => onPhotoHover(photo.id),
                mouseout: () => onPhotoHover(null),
              }}
              ref={(ref) => {
                if (ref) {
                  markerRefs.current.set(photo.id, ref);
                } else {
                  markerRefs.current.delete(photo.id);
                }
              }}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{photo.filename}</strong>
                  {photo.locationCity && (
                    <p className="popup-location">
                      📍 {[photo.locationNeighborhood, photo.locationCity, photo.locationCountry]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                  {photo.capturedAt && (
                    <p className="popup-date">
                      {new Date(photo.capturedAt).toLocaleDateString()}
                    </p>
                  )}
                  {photo.description?.mainSubject && (
                    <p className="popup-subject">{photo.description.mainSubject}</p>
                  )}
                  <button
                    className="popup-button"
                    onClick={() => scrollToPhoto(photo.id)}
                  >
                    View Photo
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

