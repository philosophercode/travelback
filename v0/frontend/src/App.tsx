import { useState, useEffect, useMemo } from 'react';
import { TripSelector } from './components/TripSelector';
import { TripOverview } from './components/TripOverview';
import { DayView } from './components/DayView';
import { PhotoThumbnails } from './components/PhotoThumbnails';
import { TripMap } from './components/TripMap';
import { UploadPage } from './components/UploadPage';
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
            onClick={() => setCurrentPage('view')}
          >
            View Trips
          </button>
          <button
            className={`nav-button ${currentPage === 'upload' ? 'active' : ''}`}
            onClick={() => setCurrentPage('upload')}
          >
            Upload Photos
          </button>
        </nav>
      </header>

      <main className="app-main">
        {currentPage === 'upload' ? (
          <UploadPage onUploadSuccess={handleUploadSuccess} />
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
          <div className="welcome">
            <p>Select a trip from the dropdown above to view its details.</p>
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
