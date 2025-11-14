import { useEffect, useState } from 'react';
import type { DayItinerary, Photo } from '../types';
import { apiClient } from '../api/client';
import { PhotoView } from './PhotoView';

interface DayViewProps {
  tripId: string;
  day: DayItinerary;
}

export function DayView({ tripId, day }: DayViewProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDayPhotos() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.fetchDay(tripId, day.dayNumber);
        setPhotos(data.photos);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load day photos');
      } finally {
        setLoading(false);
      }
    }

    loadDayPhotos();
  }, [tripId, day.dayNumber]);

  const summary = day.summary;

  return (
    <div className="day-view" id={`day-${day.dayNumber}`}>
      <div className="day-header">
        <h2>Day {day.dayNumber}</h2>
        <p className="day-date">{new Date(day.date).toLocaleDateString()}</p>
      </div>

      {summary && (
        <div className="day-summary">
          <h3>{summary.title}</h3>
          <p className="narrative">{summary.narrative}</p>

          {summary.startTime && summary.endTime && (
            <p className="time-range">
              {summary.startTime} - {summary.endTime}
            </p>
          )}

          {summary.highlights && summary.highlights.length > 0 && (
            <div className="highlights">
              <h4>Highlights</h4>
              <ul>
                {summary.highlights.map((highlight, idx) => (
                  <li key={idx}>{highlight}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.locations && summary.locations.length > 0 && (
            <div className="locations">
              <h4>Locations</h4>
              <ul>
                {summary.locations.map((location, idx) => (
                  <li key={idx}>{location}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.activities && summary.activities.length > 0 && (
            <div className="activities">
              <h4>Activities</h4>
              <ul>
                {summary.activities.map((activity, idx) => (
                  <li key={idx}>{activity}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.totalDistance > 0 && (
            <p className="distance">Total Distance: {summary.totalDistance} km</p>
          )}
        </div>
      )}

      <div className="day-photos">
        <h3>Photos ({photos.length})</h3>
        {loading && <p>Loading photos...</p>}
        {error && <p className="error">Error: {error}</p>}
        {!loading && !error && photos.length === 0 && (
          <p>No photos for this day.</p>
        )}
        {!loading && !error && photos.length > 0 && (
          <div className="photos-grid">
            {photos.map((photo) => (
              <PhotoView key={photo.id} photo={photo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

