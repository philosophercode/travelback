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
  const [showIncomplete, setShowIncomplete] = useState(false);

  useEffect(() => {
    async function loadTrips() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.fetchTrips();
        setTrips(data.trips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trips');
      } finally {
        setLoading(false);
      }
    }

    loadTrips();
    
    // Refresh trips every 5 seconds to catch status updates
    const interval = setInterval(loadTrips, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="trip-selector">Loading trips...</div>;
  }

  if (error) {
    return <div className="trip-selector error">Error: {error}</div>;
  }

  // Filter trips: only completed trips with descriptions (overview) by default
  const completedTripsWithDescriptions = trips.filter(
    trip => trip.processingStatus === 'completed' && trip.overview !== null
  );
  
  // Incomplete trips (failed, not_started, or processing)
  const incompleteTrips = trips.filter(
    trip => trip.processingStatus !== 'completed' || trip.overview === null
  );

  if (trips.length === 0) {
    return <div className="trip-selector">No trips found. Create a trip first.</div>;
  }

  const formatTripName = (trip: Trip): string => {
    // Use overview title if available, otherwise use name
    const name = trip.overview?.title || trip.name;
    // Clean up common duplicate patterns
    return name.replace(/\s*\(not_started\)\s*/gi, '').trim();
  };

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
        
        {completedTripsWithDescriptions.length > 0 && (
          <optgroup label="✓ Completed Trips">
            {completedTripsWithDescriptions.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {formatTripName(trip)}
              </option>
            ))}
          </optgroup>
        )}
        
        {showIncomplete && incompleteTrips.length > 0 && (
          <optgroup label="⚠ Incomplete / Processing">
            {incompleteTrips.map((trip) => {
              const statusLabel = trip.processingStatus === 'processing' 
                ? 'Processing...' 
                : trip.processingStatus === 'failed'
                ? 'Failed - Needs Reprocessing'
                : trip.processingStatus === 'completed' && trip.overview === null
                ? 'Completed (No Description)'
                : 'Not Started';
              return (
                <option key={trip.id} value={trip.id}>
                  {formatTripName(trip)} ({statusLabel})
                </option>
              );
            })}
          </optgroup>
        )}
      </select>

      {/* Toggle for incomplete trips */}
      {incompleteTrips.length > 0 && (
        <label className="toggle-incomplete">
          <input
            type="checkbox"
            checked={showIncomplete}
            onChange={(e) => setShowIncomplete(e.target.checked)}
          />
          <span>Show incomplete trips ({incompleteTrips.length})</span>
        </label>
      )}
    </div>
  );
}

