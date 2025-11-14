import { useState, useEffect, useMemo } from 'react';
import { TripSelector } from './components/TripSelector';
import { TripCards } from './components/TripCards';
import { TripOverview } from './components/TripOverview';
import { DayView } from './components/DayView';
import { PhotoThumbnails } from './components/PhotoThumbnails';
import { TripMap } from './components/TripMap';
import { UploadPage } from './components/UploadPage';
import { ProcessingPage } from './components/ProcessingPage';
import type { TripResponse, Trip } from './types';
import { apiClient } from './api/client';
import './App.css';

function App() {
  // Read tripId and page from URL parameters on initial load
  const getTripIdFromUrl = (): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tripId');
  };

  const getPageFromUrl = (): string => {
    const params = new URLSearchParams(window.location.search);
    return params.get('page') || 'view';
  };

  const [selectedTripId, setSelectedTripId] = useState<string | null>(getTripIdFromUrl());
  const [currentPage, setCurrentPage] = useState<string>(getPageFromUrl());
  const [tripData, setTripData] = useState<TripResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPhotoId, setHoveredPhotoId] = useState<string | null>(null);
  const [processingTripsCount, setProcessingTripsCount] = useState(0);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [cancellingTrip, setCancellingTrip] = useState(false);

  // Update URL when tripId or page changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedTripId) {
      params.set('tripId', selectedTripId);
    } else {
      params.delete('tripId');
    }
    if (currentPage !== 'view') {
      params.set('page', currentPage);
    } else {
      params.delete('page');
    }
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [selectedTripId, currentPage]);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const tripId = getTripIdFromUrl();
      const page = getPageFromUrl();
      setSelectedTripId(tripId);
      setCurrentPage(page);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle upload success
  const handleUploadSuccess = (trip: Trip) => {
    setSelectedTripId(trip.id);
    setCurrentPage('view');
  };

  // Handle trip deletion
  const handleDeleteTrip = async () => {
    if (!selectedTripId || !tripData) {
      return;
    }

    const tripName = tripData.trip.overview?.title || tripData.trip.name;
    if (!window.confirm(`Are you sure you want to delete "${tripName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingTrip(true);
      await apiClient.deleteTrip(selectedTripId);
      setSelectedTripId(null);
      setTripData(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete trip');
    } finally {
      setDeletingTrip(false);
    }
  };

  // Handle cancel processing
  const handleCancelProcessing = async () => {
    if (!selectedTripId || !tripData) {
      return;
    }

    if (!window.confirm('Are you sure you want to cancel processing? The trip will be marked as failed.')) {
      return;
    }

    try {
      setCancellingTrip(true);
      await apiClient.cancelTripProcessing(selectedTripId);
      // Reload trip data
      const data = await apiClient.fetchTrip(selectedTripId);
      setTripData(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel processing');
    } finally {
      setCancellingTrip(false);
    }
  };

  // Poll for processing trips to show icon in nav bar
  useEffect(() => {
    async function checkProcessingTrips() {
      try {
        const data = await apiClient.fetchTrips();
        const processingTrips = data.trips.filter(
          (trip) => trip.processingStatus === 'processing' || trip.processingStatus === 'pending'
        );
        setProcessingTripsCount(processingTrips.length);
      } catch (err) {
        // Silently fail - don't show error for background polling
        console.error('Failed to check processing trips:', err);
      }
    }

    checkProcessingTrips();
    // Poll every 5 seconds
    const interval = setInterval(checkProcessingTrips, 5000);
    return () => clearInterval(interval);
  }, []);

  // Memoize days array to prevent unnecessary rerenders in child components
  const stableDays = useMemo(() => {
    return tripData?.days || [];
  }, [tripData?.days ? tripData.days.map(d => d.id).join(',') : '']);

  useEffect(() => {
    if (!selectedTripId) {
      setTripData(null);
      return;
    }

    async function loadTrip() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.fetchTrip(selectedTripId!);
        setTripData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trip');
        setTripData(null);
      } finally {
        setLoading(false);
      }
    }

    loadTrip();
  }, [selectedTripId]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>TravelBack</h1>
        <p>View your trip photos, descriptions, and narratives</p>
        <nav className="app-nav">
          <button
            className={`nav-button ${currentPage === 'view' ? 'active' : ''}`}
            onClick={() => {
              setCurrentPage('view');
              setSelectedTripId(null);
            }}
          >
            View Trips
          </button>
          <button
            className={`nav-button ${currentPage === 'upload' ? 'active' : ''}`}
            onClick={() => setCurrentPage('upload')}
          >
            Upload Photos
          </button>
          {processingTripsCount > 0 && (
            <button
              className={`nav-button nav-button-processing ${currentPage === 'processing' ? 'active' : ''}`}
              onClick={() => setCurrentPage('processing')}
              title={`${processingTripsCount} trip${processingTripsCount !== 1 ? 's' : ''} processing`}
            >
              <span className="processing-icon">⚙️</span>
              <span className="processing-badge">{processingTripsCount}</span>
            </button>
          )}
        </nav>
      </header>

      <main className="app-main">
        {currentPage === 'upload' ? (
          <UploadPage onUploadSuccess={handleUploadSuccess} />
        ) : currentPage === 'processing' ? (
          <ProcessingPage onTripSelect={(tripId) => {
            setSelectedTripId(tripId);
            setCurrentPage('view');
          }} />
        ) : (
          <>
            <TripSelector
              selectedTripId={selectedTripId}
              onTripSelect={setSelectedTripId}
            />

        {loading && <div className="loading">Loading trip...</div>}

        {error && <div className="error">Error: {error}</div>}

        {tripData && (
          <div className="trip-content">
            <div className="trip-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <h2>{tripData.trip.overview?.title || tripData.trip.name}</h2>
                  {tripData.trip.startDate && (
                    <p className="trip-dates">
                      {new Date(tripData.trip.startDate).toLocaleDateString()}
                      {tripData.trip.endDate &&
                        ` - ${new Date(tripData.trip.endDate).toLocaleDateString()}`}
                    </p>
                  )}
                  <p className="trip-status">
                    Status: <strong>{tripData.trip.processingStatus}</strong>
                  </p>
                  <p className="trip-stats">
                    {tripData.totalPhotos} photos • {tripData.days.length} days
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column', alignItems: 'flex-end' }}>
                  {tripData.trip.processingStatus === 'processing' || tripData.trip.processingStatus === 'pending' ? (
                    <button
                      className="trip-cancel-button"
                      onClick={handleCancelProcessing}
                      disabled={cancellingTrip}
                      title="Cancel processing"
                    >
                      {cancellingTrip ? 'Cancelling...' : '✕ Cancel'}
                    </button>
                  ) : (
                    <button
                      className="trip-delete-button"
                      onClick={handleDeleteTrip}
                      disabled={deletingTrip}
                      title="Delete trip"
                    >
                      {deletingTrip ? 'Deleting...' : '🗑️ Delete'}
                    </button>
                  )}
                </div>
              </div>
              {stableDays.length > 0 && (
                <div className="photos-and-map-container">
                  <PhotoThumbnails 
                    tripId={tripData.trip.id} 
                    days={stableDays}
                    hoveredPhotoId={hoveredPhotoId}
                    onPhotoHover={setHoveredPhotoId}
                  />
                  <TripMap 
                    tripId={tripData.trip.id} 
                    days={stableDays}
                    onPhotoHover={setHoveredPhotoId}
                    hoveredPhotoId={hoveredPhotoId}
                  />
                </div>
              )}
            </div>

            {tripData.trip.overview && (
              <div className="trip-overview-section">
                <TripOverview overview={tripData.trip.overview} />
              </div>
            )}

            {tripData.days.length > 0 && (
              <div className="trip-days">
                <h2>Days</h2>
                {tripData.days.map((day) => (
                  <DayView key={day.id} tripId={tripData.trip.id} day={day} />
                ))}
              </div>
            )}

            {tripData.days.length === 0 && tripData.trip.processingStatus === 'completed' && (
              <div className="no-days">
                <p>No day itineraries available for this trip.</p>
              </div>
            )}
          </div>
        )}

        {!selectedTripId && (
          <TripCards onTripSelect={setSelectedTripId} />
        )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
