import { useEffect, useState } from 'react';
import type { Trip } from '../types';
import { apiClient } from '../api/client';

interface TripSelectorProps {
  selectedTripId: string | null;
  onTripSelect: (tripId: string) => void;
}

export function TripSelector({ selectedTripId, onTripSelect }: TripSelectorProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTrips() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.fetchTrips();
        // Sort trips: completed first, then by creation date (newest first)
        const sorted = data.trips.sort((a, b) => {
          if (a.processingStatus === 'completed' && b.processingStatus !== 'completed') return -1;
          if (a.processingStatus !== 'completed' && b.processingStatus === 'completed') return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setTrips(sorted);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trips');
      } finally {
        setLoading(false);
      }
    }

    loadTrips();
  }, []);

  if (loading) {
    return <div className="trip-selector">Loading trips...</div>;
  }

  if (error) {
    return <div className="trip-selector error">Error: {error}</div>;
  }

  if (trips.length === 0) {
    return <div className="trip-selector">No trips found. Create a trip first.</div>;
  }

  return (
    <div className="trip-selector">
      <label htmlFor="trip-select">
        <strong>Select Trip:</strong>
      </label>
      <select
        id="trip-select"
        value={selectedTripId || ''}
        onChange={(e) => onTripSelect(e.target.value)}
      >
        <option value="">-- Choose a trip --</option>
        {trips.map((trip) => {
          const displayName = trip.overview?.title || trip.name;
          const statusBadge = trip.processingStatus === 'completed' ? '✓' : trip.processingStatus;
          return (
            <option key={trip.id} value={trip.id}>
              {displayName} ({statusBadge})
            </option>
          );
        })}
      </select>
    </div>
  );
}

