import { useEffect, useState, useMemo } from 'react';
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
    let isInitialLoad = true;
    
    async function loadTrips() {
      try {
        if (isInitialLoad) {
          setLoading(true);
          setError(null);
        }
        
        const data = await apiClient.fetchTrips();
        const sortedTrips = data.trips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        // Only update state if trips actually changed
        setTrips(prevTrips => {
          // Quick check: if lengths differ, definitely update
          if (prevTrips.length !== sortedTrips.length) {
            return sortedTrips;
          }
          
          // Deep comparison: check if any trip changed
          const hasChanges = sortedTrips.some((newTrip, index) => {
            const prevTrip = prevTrips[index];
            if (!prevTrip) return true;
            
            // Compare key fields that would indicate a change
            return (
              prevTrip.id !== newTrip.id ||
              prevTrip.processingStatus !== newTrip.processingStatus ||
              prevTrip.overview?.title !== newTrip.overview?.title ||
              prevTrip.name !== newTrip.name
            );
          });
          
          return hasChanges ? sortedTrips : prevTrips;
        });
        
        if (isInitialLoad) {
          setLoading(false);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load trips';
        setError(prevError => {
          if (prevError === errorMessage) return prevError;
          return errorMessage;
        });
        if (isInitialLoad) {
          setLoading(false);
        }
      }
      
      isInitialLoad = false;
    }

    loadTrips();
    
    // Refresh trips less frequently - every 30 seconds as fallback
    const interval = setInterval(loadTrips, 30000);
    return () => clearInterval(interval);
  }, []);

  // Memoize filtered trips to avoid recalculating on every render
  const { completedTripsWithDescriptions, incompleteTrips } = useMemo(() => {
    const completed = trips.filter(
      trip => trip.processingStatus === 'completed' && trip.overview !== null
    );
    const incomplete = trips.filter(
      trip => trip.processingStatus !== 'completed' || trip.overview === null
    );
    return { completedTripsWithDescriptions: completed, incompleteTrips: incomplete };
  }, [trips]);

  if (loading) {
    return <div className="trip-selector">Loading trips...</div>;
  }

  if (error) {
    return <div className="trip-selector error">Error: {error}</div>;
  }

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

