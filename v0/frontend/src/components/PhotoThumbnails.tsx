import { useEffect, useState } from 'react';
import type { DayItinerary, Photo } from '../types';
import { apiClient } from '../api/client';

interface PhotoThumbnailsProps {
  tripId: string;
  days: DayItinerary[];
  hoveredPhotoId: string | null;
  onPhotoHover: (photoId: string | null) => void;
}

export function PhotoThumbnails({ tripId, days, hoveredPhotoId, onPhotoHover }: PhotoThumbnailsProps) {
  const [dayPhotos, setDayPhotos] = useState<Map<number, Photo[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const scrollToPhoto = (photoId: string) => {
    const element = document.getElementById(`photo-${photoId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a highlight effect
      element.style.boxShadow = '0 0 0 4px rgba(25, 118, 210, 0.5)';
      setTimeout(() => {
        element.style.boxShadow = '';
      }, 2000);
    }
  };

  const scrollToDay = (dayNumber: number) => {
    const element = document.getElementById(`day-${dayNumber}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    async function loadAllDayPhotos() {
      try {
        setLoading(true);
        const photosMap = new Map<number, Photo[]>();

        // Fetch photos for each day in parallel
        const photoPromises = days.map(async (day) => {
          try {
            const data = await apiClient.fetchDay(tripId, day.dayNumber);
            return { dayNumber: day.dayNumber, photos: data.photos };
          } catch (err) {
            console.error(`Failed to load photos for day ${day.dayNumber}:`, err);
            return { dayNumber: day.dayNumber, photos: [] };
          }
        });

        const results = await Promise.all(photoPromises);
        results.forEach(({ dayNumber, photos }) => {
          photosMap.set(dayNumber, photos);
        });

        setDayPhotos(photosMap);
      } catch (err) {
        console.error('Failed to load day photos:', err);
      } finally {
        setLoading(false);
      }
    }

    if (days.length > 0) {
      loadAllDayPhotos();
    } else {
      setLoading(false);
    }
  }, [tripId, days]);

  if (loading) {
    return (
      <div className="photo-thumbnails">
        <p className="loading-text">Loading thumbnails...</p>
      </div>
    );
  }

  const totalPhotos = Array.from(dayPhotos.values()).reduce((sum, photos) => sum + photos.length, 0);

  if (totalPhotos === 0) {
    return null;
  }

  return (
    <div className="photo-thumbnails">
      <h3 className="thumbnails-title">Photos by Day</h3>
      <div className="thumbnails-by-day">
        {days.map((day) => {
          const photos = dayPhotos.get(day.dayNumber) || [];
          if (photos.length === 0) return null;

          return (
            <div key={day.id} className="day-thumbnails">
              <h4 
                className="day-thumbnails-title clickable"
                onClick={() => scrollToDay(day.dayNumber)}
                title={`Scroll to Day ${day.dayNumber}`}
              >
                Day {day.dayNumber}
              </h4>
              <div className="thumbnails-grid">
                {photos.map((photo) => {
                  const imageUrl = apiClient.resolveMediaUrl(photo.fileUrl);
                  const isHovered = hoveredPhotoId === photo.id;
                  return (
                    <div 
                      key={photo.id} 
                      className={`thumbnail ${isHovered ? 'thumbnail-hovered' : ''}`}
                      onClick={() => scrollToPhoto(photo.id)}
                      onMouseEnter={() => {
                        // Only trigger if photo has location data
                        if (photo.locationLatitude !== null && photo.locationLongitude !== null) {
                          onPhotoHover(photo.id);
                        }
                      }}
                      onMouseLeave={() => {
                        if (photo.locationLatitude !== null && photo.locationLongitude !== null) {
                          onPhotoHover(null);
                        }
                      }}
                      title={`Scroll to ${photo.filename}`}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={photo.filename}
                        />
                      ) : (
                        <div className="thumbnail-placeholder">
                          <span>No image</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

