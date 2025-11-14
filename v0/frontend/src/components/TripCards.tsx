import { useEffect, useState } from 'react';
import type { Trip } from '../types';
import { apiClient } from '../api/client';
import './TripCards.css';

interface TripCardsProps {
  onTripSelect: (tripId: string) => void;
}

type SortOption = 'dateCreated' | 'yearTraveled' | 'continent' | 'grouping';
type SortDirection = 'asc' | 'desc';

export function TripCards({ onTripSelect }: TripCardsProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('dateCreated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const loadTrips = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.fetchTrips();
      setTrips(data.trips);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  const sortTrips = (tripsToSort: Trip[]): Trip[] => {
    const sorted = [...tripsToSort];
    
    sorted.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'dateCreated':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'yearTraveled':
          const yearA = getYearTraveled(a);
          const yearB = getYearTraveled(b);
          if (yearA === null && yearB === null) comparison = 0;
          else if (yearA === null) comparison = 1;
          else if (yearB === null) comparison = -1;
          else comparison = yearA - yearB;
          break;
        case 'continent':
          const continentA = getContinent(a);
          const continentB = getContinent(b);
          comparison = continentA.localeCompare(continentB);
          break;
        case 'grouping':
          // Group by processing status, then by date created
          const statusA = a.processingStatus;
          const statusB = b.processingStatus;
          if (statusA !== statusB) {
            comparison = statusA.localeCompare(statusB);
          } else {
            comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  };

  useEffect(() => {
    loadTrips();
  }, []);

  const handleDeleteTrip = async (tripId: string, tripName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    
    if (!window.confirm(`Are you sure you want to delete "${tripName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingTripId(tripId);
      await apiClient.deleteTrip(tripId);
      await loadTrips();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete trip');
    } finally {
      setDeletingTripId(null);
    }
  };



  const formatTripName = (trip: Trip): string => {
    const name = trip.overview?.title || trip.name;
    return name.replace(/\s*\(not_started\)\s*/gi, '').trim();
  };

  const formatDateRange = (trip: Trip): string => {
    if (!trip.startDate) return 'No dates';
    const start = new Date(trip.startDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (!trip.endDate) return start;
    const end = new Date(trip.endDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${start} - ${end}`;
  };

  const formatCreatedDate = (trip: Trip): string => {
    const date = new Date(trip.createdAt);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dateStr} at ${timeStr}`;
  };

  const getYearTraveled = (trip: Trip): number | null => {
    if (!trip.startDate) return null;
    return new Date(trip.startDate).getFullYear();
  };

  const getContinent = (trip: Trip): string => {
    // Try to get continent from destinations in overview
    if (trip.overview?.destinations && trip.overview.destinations.length > 0) {
      // Extract country from destination names (format: "City, Country")
      const countries = trip.overview.destinations
        .map(dest => {
          const parts = dest.name.split(',').map(s => s.trim());
          return parts.length > 1 ? parts[parts.length - 1] : null;
        })
        .filter(Boolean) as string[];
      
      if (countries.length > 0) {
        return countryToContinent(countries[0]) || 'Unknown';
      }
    }
    return 'Unknown';
  };

  const countryToContinent = (country: string): string | null => {
    const countryMap: Record<string, string> = {
      // Europe
      'France': 'Europe', 'Italy': 'Europe', 'Spain': 'Europe', 'Germany': 'Europe',
      'United Kingdom': 'Europe', 'UK': 'Europe', 'Greece': 'Europe', 'Portugal': 'Europe',
      'Netherlands': 'Europe', 'Belgium': 'Europe', 'Switzerland': 'Europe', 'Austria': 'Europe',
      'Czech Republic': 'Europe', 'Poland': 'Europe', 'Hungary': 'Europe', 'Croatia': 'Europe',
      'Ireland': 'Europe', 'Denmark': 'Europe', 'Sweden': 'Europe', 'Norway': 'Europe',
      'Finland': 'Europe', 'Iceland': 'Europe', 'Russia': 'Europe', 'Turkey': 'Europe',
      // North America
      'United States': 'North America', 'USA': 'North America', 'US': 'North America',
      'Canada': 'North America', 'Mexico': 'North America', 'Costa Rica': 'North America',
      'Panama': 'North America', 'Jamaica': 'North America', 'Cuba': 'North America',
      // South America
      'Brazil': 'South America', 'Argentina': 'South America', 'Chile': 'South America',
      'Peru': 'South America', 'Colombia': 'South America', 'Ecuador': 'South America',
      // Asia
      'China': 'Asia', 'Japan': 'Asia', 'India': 'Asia', 'Thailand': 'Asia',
      'Vietnam': 'Asia', 'Singapore': 'Asia', 'Malaysia': 'Asia', 'Indonesia': 'Asia',
      'Philippines': 'Asia', 'South Korea': 'Asia', 'Taiwan': 'Asia', 'Hong Kong': 'Asia',
      'Nepal': 'Asia', 'Cambodia': 'Asia', 'Myanmar': 'Asia', 'Laos': 'Asia',
      'Sri Lanka': 'Asia', 'Bangladesh': 'Asia', 'Pakistan': 'Asia', 'Israel': 'Asia',
      'United Arab Emirates': 'Asia', 'UAE': 'Asia', 'Saudi Arabia': 'Asia', 'Qatar': 'Asia',
      // Africa
      'South Africa': 'Africa', 'Egypt': 'Africa', 'Morocco': 'Africa', 'Kenya': 'Africa',
      'Tanzania': 'Africa', 'Ethiopia': 'Africa', 'Ghana': 'Africa', 'Nigeria': 'Africa',
      // Oceania
      'Australia': 'Oceania', 'New Zealand': 'Oceania', 'NZ': 'Oceania', 'Fiji': 'Oceania',
      'Tahiti': 'Oceania', 'Hawaii': 'Oceania',
    };
    
    return countryMap[country] || null;
  };

  const getStatusBadgeClass = (status: Trip['processingStatus']): string => {
    switch (status) {
      case 'completed':
        return 'status-badge status-completed';
      case 'processing':
        return 'status-badge status-processing';
      case 'failed':
        return 'status-badge status-failed';
      default:
        return 'status-badge status-pending';
    }
  };

  const getStatusLabel = (trip: Trip): string => {
    if (trip.processingStatus === 'completed' && trip.overview === null) {
      return 'Completed (No Description)';
    }
    switch (trip.processingStatus) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing...';
      case 'failed':
        return 'Failed';
      default:
        return 'Not Started';
    }
  };

  if (loading) {
    return (
      <div className="trip-cards-container">
        <div className="loading">Loading trips...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trip-cards-container">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="trip-cards-container">
        <div className="no-trips">
          <p>No trips found. Create a trip by uploading photos!</p>
        </div>
      </div>
    );
  }

  const sortedTrips = sortTrips(trips);
  const completedTrips = sortedTrips.filter(
    (trip) => trip.processingStatus === 'completed' && trip.overview !== null
  );
  const otherTrips = sortedTrips.filter(
    (trip) => trip.processingStatus !== 'completed' || trip.overview === null
  );

  const handleDeleteAllOtherTrips = async () => {
    if (otherTrips.length === 0) {
      return;
    }

    if (!window.confirm(`Are you sure you want to delete all ${otherTrips.length} trip(s) in the "Other Trips" section? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingAll(true);
      // Delete trips one by one (or we could add a bulk delete endpoint)
      // For now, delete them sequentially
      for (const trip of otherTrips) {
        try {
          await apiClient.deleteTrip(trip.id);
        } catch (err) {
          console.error(`Failed to delete trip ${trip.id}`, err);
          // Continue with other deletions
        }
      }
      await loadTrips();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete trips');
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="trip-cards-container">
      <div className="trip-cards-sort-controls">
        <label htmlFor="sort-by">Sort by:</label>
        <select
          id="sort-by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="sort-select"
        >
          <option value="dateCreated">Date Created</option>
          <option value="yearTraveled">Year Traveled</option>
          <option value="continent">Continent</option>
          <option value="grouping">Grouping</option>
        </select>
        <button
          className="sort-direction-button"
          onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
          title={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
        >
          {sortDirection === 'desc' ? 'Most Recent' : 'Oldest'}
        </button>
      </div>
      {completedTrips.length > 0 && (
        <div className="trip-cards-section">
          <h2 className="trip-cards-section-title">Completed Trips</h2>
          <div className="trip-cards-grid">
            {completedTrips.map((trip) => (
              <div
                key={trip.id}
                className="trip-card"
                onClick={() => onTripSelect(trip.id)}
              >
                {trip.thumbnailUrl && (
                  <div className="trip-card-image">
                    <img
                      src={apiClient.resolveMediaUrl(trip.thumbnailUrl) || ''}
                      alt={formatTripName(trip)}
                      onError={(e) => {
                        // Hide image if it fails to load
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div className="trip-card-header">
                  <h3 className="trip-card-title">{formatTripName(trip)}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className={getStatusBadgeClass(trip.processingStatus)}>
                      {getStatusLabel(trip)}
                    </span>
                    <button
                      className="trip-card-delete-button"
                      onClick={(e) => handleDeleteTrip(trip.id, formatTripName(trip), e)}
                      disabled={deletingTripId === trip.id}
                      title="Delete trip"
                    >
                      {deletingTripId === trip.id ? '...' : '✕'}
                    </button>
                  </div>
                </div>
                <div className="trip-card-body">
                  <p className="trip-card-dates">{formatDateRange(trip)}</p>
                  <p className="trip-card-created">Created: {formatCreatedDate(trip)}</p>
                  {trip.overview && (
                    <div className="trip-card-stats">
                      <span className="trip-card-stat">
                        {trip.overview.totalDays} {trip.overview.totalDays === 1 ? 'day' : 'days'}
                      </span>
                      <span className="trip-card-stat">
                        {trip.overview.totalPhotos} {trip.overview.totalPhotos === 1 ? 'photo' : 'photos'}
                      </span>
                    </div>
                  )}
                  {trip.overview?.summary && (
                    <p className="trip-card-summary">{trip.overview.summary}</p>
                  )}
                </div>
                <div className="trip-card-footer">
                  <button className="trip-card-button">View Trip →</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {otherTrips.length > 0 && (
        <div className="trip-cards-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 className="trip-cards-section-title" style={{ margin: 0 }}>Other Trips</h2>
            <button
              className="delete-all-others-button"
              onClick={handleDeleteAllOtherTrips}
              disabled={deletingAll}
              title={`Delete all ${otherTrips.length} trip(s)`}
            >
              {deletingAll ? 'Deleting...' : `🗑️ Delete All (${otherTrips.length})`}
            </button>
          </div>
          <div className="trip-cards-grid">
            {otherTrips.map((trip) => (
              <div
                key={trip.id}
                className="trip-card"
                onClick={() => onTripSelect(trip.id)}
              >
                {trip.thumbnailUrl && (
                  <div className="trip-card-image">
                    <img
                      src={apiClient.resolveMediaUrl(trip.thumbnailUrl) || ''}
                      alt={formatTripName(trip)}
                      onError={(e) => {
                        // Hide image if it fails to load
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div className="trip-card-header">
                  <h3 className="trip-card-title">{formatTripName(trip)}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className={getStatusBadgeClass(trip.processingStatus)}>
                      {getStatusLabel(trip)}
                    </span>
                    <button
                      className="trip-card-delete-button"
                      onClick={(e) => handleDeleteTrip(trip.id, formatTripName(trip), e)}
                      disabled={deletingTripId === trip.id}
                      title="Delete trip"
                    >
                      {deletingTripId === trip.id ? '...' : '✕'}
                    </button>
                  </div>
                </div>
                <div className="trip-card-body">
                  <p className="trip-card-dates">{formatDateRange(trip)}</p>
                  {trip.overview && (
                    <div className="trip-card-stats">
                      <span className="trip-card-stat">
                        {trip.overview.totalDays} {trip.overview.totalDays === 1 ? 'day' : 'days'}
                      </span>
                      <span className="trip-card-stat">
                        {trip.overview.totalPhotos} {trip.overview.totalPhotos === 1 ? 'photo' : 'photos'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="trip-card-footer">
                  <button className="trip-card-button">View Trip →</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

