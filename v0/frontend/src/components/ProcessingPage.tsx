import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { Trip } from '../types';
import './ProcessingPage.css';

interface ProcessingPageProps {
  onTripSelect: (tripId: string) => void;
}

export function ProcessingPage({ onTripSelect }: ProcessingPageProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTrips() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.fetchTrips();
        // Filter for processing trips
        const processingTrips = data.trips.filter(
          (trip) => trip.processingStatus === 'processing' || trip.processingStatus === 'pending'
        );
        setTrips(processingTrips);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trips');
      } finally {
        setLoading(false);
      }
    }

    loadTrips();

    // Poll every 5 seconds for updates
    const interval = setInterval(loadTrips, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatTripName = (trip: Trip): string => {
    const baseName = trip.overview?.title || trip.name;
    // If multiple trips have the same name, add creation date/time to differentiate
    const createdAt = new Date(trip.createdAt);
    const dateStr = createdAt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${baseName} (${dateStr})`;
  };

  const getStatusLabel = (status: Trip['processingStatus']): string => {
    switch (status) {
      case 'processing':
        return 'Processing...';
      case 'pending':
        return 'Pending';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="processing-page">
        <div className="loading">Loading processing trips...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="processing-page">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="processing-page">
        <div className="no-processing-trips">
          <h2>No trips currently processing</h2>
          <p>All trips have completed processing, or no trips are being processed at the moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="processing-page">
      <h2>Processing Trips</h2>
      <p className="processing-description">
        The following trips are currently being processed. This page will update automatically.
      </p>
      <div className="processing-trips-list">
        {trips.map((trip) => (
          <div key={trip.id} className="processing-trip-card">
            <div className="processing-trip-header">
              <h3>{formatTripName(trip)}</h3>
              <span className={`status-badge status-${trip.processingStatus}`}>
                {getStatusLabel(trip.processingStatus)}
              </span>
            </div>
            <div className="processing-trip-info">
              <p className="trip-id">Trip ID: {trip.id}</p>
              {trip.startDate && (
                <p className="trip-date">
                  Started: {new Date(trip.startDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
              <p className="trip-created">
                Created: {new Date(trip.createdAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </p>
            </div>
            <button
              className="view-trip-button"
              onClick={() => onTripSelect(trip.id)}
            >
              View Trip
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

