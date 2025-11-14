import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TripSelector } from './components/TripSelector';
import { TripCards } from './components/TripCards';
import { TripOverview } from './components/TripOverview';
import { DayView } from './components/DayView';
import { PhotoThumbnails } from './components/PhotoThumbnails';
import { TripMap } from './components/TripMap';
import { UploadPage } from './components/UploadPage';
import { ProcessingPage } from './components/ProcessingPage';
import { NarrationWizard } from './components/NarrationWizard';
import type { TripResponse, Trip, ProcessingProgress } from './types';
import { apiClient } from './api/client';
import './App.css';

function App() {
  // Read tripId from URL query parameters and page from pathname
  const getTripIdFromUrl = (): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tripId');
  };

  const getPageFromUrl = (): string => {
    const pathname = window.location.pathname;
    if (pathname === '/upload') {
      return 'upload';
    }
    return 'view';
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
  const [showNarrationWizard, setShowNarrationWizard] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [isClearingTrip, setIsClearingTrip] = useState(false);
  const viewTripsButtonRef = useRef<HTMLButtonElement>(null);

  // Update URL when tripId or page changes (but not when we're intentionally clearing)
  useEffect(() => {
    if (isClearingTrip) {
      setIsClearingTrip(false);
      return;
    }
    
    const params = new URLSearchParams(window.location.search);
    if (selectedTripId) {
      params.set('tripId', selectedTripId);
    } else {
      params.delete('tripId');
    }
    
    // Set pathname based on page
    let pathname = '/';
    if (currentPage === 'upload') {
      pathname = '/upload';
    }
    
    // Build new URL with pathname and query params
    const queryString = params.toString();
    const newUrl = queryString
      ? `${pathname}?${queryString}`
      : pathname;
    window.history.replaceState({}, '', newUrl);
  }, [selectedTripId, currentPage, isClearingTrip]);

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
    // Navigate to view page
    window.history.replaceState({}, '', `/?tripId=${trip.id}`);
  };

  // Ensure View Trips button has correct type attribute
  useEffect(() => {
    if (viewTripsButtonRef.current && viewTripsButtonRef.current.type !== 'button') {
      viewTripsButtonRef.current.type = 'button';
    }
  }, [currentPage]);

  // Handle View Trips button click
  const handleViewTripsClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('View Trips button clicked - clearing trip selection');
    
    // Ensure button type is set (workaround for React not rendering type attribute)
    if (e.currentTarget.type !== 'button') {
      e.currentTarget.type = 'button';
    }
    
    // Set flag to prevent URL sync from interfering
    setIsClearingTrip(true);
    // Update URL first to clear tripId
    window.history.replaceState({}, '', '/');
    // Then clear all state - use functional updates to ensure they happen
    setSelectedTripId(() => null);
    setTripData(() => null);
    setError(() => null);
    setCurrentPage(() => 'view');
  }, []);

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
      setProcessingProgress(null);
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

  // Connect to SSE stream for processing trips
  useEffect(() => {
    if (!selectedTripId || !tripData) {
      return;
    }

    const isProcessing = tripData.trip.processingStatus === 'processing' || tripData.trip.processingStatus === 'pending';
    if (!isProcessing) {
      setProcessingProgress(null);
      return;
    }

    // Connect to SSE stream
    const cleanup = apiClient.connectToTripStatusStream(selectedTripId, (event) => {
      if (event.type === 'progress') {
        setProcessingProgress(event.data as ProcessingProgress);
      } else if (event.type === 'status') {
        const statusData = event.data as { status: string; message?: string };
        // Reload trip data when status changes
        if (statusData.status === 'completed' || statusData.status === 'failed') {
          apiClient.fetchTrip(selectedTripId).then(setTripData).catch(console.error);
          setProcessingProgress(null);
        }
      } else if (event.type === 'summary') {
        // Reload trip data when summary is received (processing complete)
        apiClient.fetchTrip(selectedTripId).then(setTripData).catch(console.error);
        setProcessingProgress(null);
      }
    });

    return cleanup;
  }, [selectedTripId, tripData?.trip.processingStatus]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>TravelBack</h1>
        <p>View your trip photos, descriptions, and narratives</p>
        <nav className="app-nav">
          <button
            type="button"
            ref={viewTripsButtonRef}
            className={`nav-button ${currentPage === 'view' ? 'active' : ''}`}
            onClick={handleViewTripsClick}
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
            {selectedTripId && (
              <TripSelector
                selectedTripId={selectedTripId}
                onTripSelect={setSelectedTripId}
              />
            )}

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
                  {processingProgress && (
                    <div className="processing-progress">
                      <div className="progress-step">
                        <span className="progress-step-label">
                          {processingProgress.step === 'photos' && '📸 Photos'}
                          {processingProgress.step === 'clustering' && '📅 Clustering'}
                          {processingProgress.step === 'itineraries' && '📝 Days'}
                          {processingProgress.step === 'overview' && '🎯 Overview'}
                        </span>
                        <span className="progress-message">{processingProgress.message}</span>
                        {processingProgress.total !== undefined && processingProgress.completed !== undefined && (
                          <div className="progress-bar-container">
                            <div 
                              className="progress-bar" 
                              style={{ 
                                width: `${(processingProgress.completed / processingProgress.total) * 100}%` 
                              }}
                            />
                            <span className="progress-count">
                              {processingProgress.completed} / {processingProgress.total}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
                    <>
                      {tripData.trip.processingStatus === 'completed' && (
                        <button
                          className="trip-enhance-button"
                          onClick={() => setShowNarrationWizard(true)}
                          title={
                            !tripData.trip.narrationState || tripData.trip.narrationState.status === 'not_started'
                              ? 'Create personalized trip itinerary'
                              : tripData.trip.narrationState.status === 'in_progress'
                              ? 'Continue trip itinerary'
                              : 'Restart trip itinerary'
                          }
                        >
                          {!tripData.trip.narrationState || tripData.trip.narrationState.status === 'not_started'
                            ? '✨ Trip Itinerary Narration'
                            : tripData.trip.narrationState.status === 'in_progress'
                            ? '🎙️ Trip Talk'
                            : '✨ Restart Itinerary'}
                        </button>
                      )}
                      <button
                        className="trip-delete-button"
                        onClick={handleDeleteTrip}
                        disabled={deletingTrip}
                        title="Delete trip"
                      >
                        {deletingTrip ? 'Deleting...' : '🗑️ Delete'}
                      </button>
                    </>
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

        {showNarrationWizard && selectedTripId && tripData && (
          <NarrationWizard
            tripId={selectedTripId}
            tripData={tripData}
            onClose={() => {
              setShowNarrationWizard(false);
              // Reload trip data to get updated narration state
              if (selectedTripId) {
                apiClient.fetchTrip(selectedTripId).then(setTripData).catch(console.error);
              }
            }}
            onComplete={async () => {
              setShowNarrationWizard(false);
              // Reload trip data to get updated narration state and personalized content
              if (selectedTripId) {
                const updatedData = await apiClient.fetchTrip(selectedTripId);
                setTripData(updatedData);
              }
            }}
          />
        )}
      </main>
    </div>
  );
}

export default App;
