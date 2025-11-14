import type { ApiResponse, DayWithPhotos, TripResponse, Trip, Photo } from '../types';

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3000';

function withBase(path: string): string {
  if (path.startsWith('http')) {
    return path;
  }

  if (path.startsWith('/')) {
    return `${apiBase}${path}`;
  }

  return `${apiBase}/${path}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = withBase(path);

  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error('Unable to reach the TravelBack API. Is the backend running?');
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error('Received an invalid response from the API.');
  }

  if (!payload.success) {
    throw new Error(payload.error?.message ?? 'API request failed.');
  }

  return payload.data;
}

export async function fetchTrips(): Promise<{ trips: Trip[] }> {
  return request<{ trips: Trip[] }>('/api/trips');
}

export async function fetchTrip(tripId: string): Promise<TripResponse> {
  return request<TripResponse>(`/api/trips/${tripId}`);
}

export async function fetchDay(tripId: string, dayNumber: number): Promise<DayWithPhotos> {
  return request<DayWithPhotos>(`/api/trips/${tripId}/days/${dayNumber}`);
}

export function resolveMediaUrl(fileUrl?: string | null): string | null {
  if (!fileUrl) {
    return null;
  }

  if (fileUrl.startsWith('http')) {
    return fileUrl;
  }

  return withBase(fileUrl);
}

async function uploadTripWithPhotos(
  photos: File[],
  name?: string
): Promise<{ trip: Trip; uploadedCount: number; photos: Photo[] }> {
  const url = withBase('/api/trips/upload');
  const formData = new FormData();

  // Add photos
  photos.forEach((photo) => {
    formData.append('photos', photo);
  });

  // Add optional trip name
  if (name && name.trim()) {
    formData.append('name', name.trim());
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    throw new Error('Unable to reach the TravelBack API. Is the backend running?');
  }

  let payload: ApiResponse<{ trip: Trip; uploadedCount: number; photos: Photo[] }>;
  try {
    payload = (await response.json()) as ApiResponse<{
      trip: Trip;
      uploadedCount: number;
      photos: Photo[];
    }>;
  } catch {
    throw new Error('Received an invalid response from the API.');
  }

  if (!payload.success) {
    throw new Error(payload.error?.message ?? 'API request failed.');
  }

  return payload.data;
}

async function deleteTrip(tripId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/trips/${tripId}`, {
    method: 'DELETE',
  });
}

async function deleteAllOtherTrips(tripId: string): Promise<{ message: string; deletedCount: number }> {
  return request<{ message: string; deletedCount: number }>(`/api/trips/${tripId}/others`, {
    method: 'DELETE',
  });
}

async function cancelTripProcessing(tripId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/trips/${tripId}/cancel`, {
    method: 'POST',
  });
}

async function startNarration(tripId: string): Promise<{ state: any }> {
  return request<{ state: any }>(`/api/trips/${tripId}/narration/start`, {
    method: 'POST',
  });
}

async function getNarrationState(tripId: string): Promise<{ state: any }> {
  return request<{ state: any }>(`/api/trips/${tripId}/narration/state`);
}

async function getPhotoContext(tripId: string, photoId: string): Promise<{ context: any }> {
  return request<{ context: any }>(`/api/trips/${tripId}/narration/photos/${photoId}/context`);
}

async function getPhotoQuestions(tripId: string, photoId: string): Promise<{ questions: any[] }> {
  return request<{ questions: any[] }>(`/api/trips/${tripId}/narration/photos/${photoId}/questions`);
}

async function submitNarrationAnswer(
  tripId: string,
  answer: {
    questionId: string;
    questionText: string;
    photoId: string;
    dayNumber: number;
    answer: string;
    audioUrl?: string;
  }
): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/trips/${tripId}/narration/answer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(answer),
  });
}

async function completeNarration(tripId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/trips/${tripId}/narration/complete`, {
    method: 'POST',
  });
}

/**
 * Connect to trip status SSE stream
 * Returns an EventSource and a cleanup function
 */
function connectToTripStatusStream(
  tripId: string,
  onEvent: (event: { type: string; data: unknown }) => void
): () => void {
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3000';
  const url = `${apiBase}/api/trips/${tripId}/status`;
  
  const eventSource = new EventSource(url);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onEvent({ type: 'message', data });
    } catch (error) {
      console.error('Failed to parse SSE message:', error);
    }
  };
  
  // Handle custom event types
  eventSource.addEventListener('status', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      onEvent({ type: 'status', data });
    } catch (error) {
      console.error('Failed to parse SSE status event:', error);
    }
  });
  
  eventSource.addEventListener('progress', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      onEvent({ type: 'progress', data });
    } catch (error) {
      console.error('Failed to parse SSE progress event:', error);
    }
  });
  
  eventSource.addEventListener('summary', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      onEvent({ type: 'summary', data });
    } catch (error) {
      console.error('Failed to parse SSE summary event:', error);
    }
  });
  
  eventSource.addEventListener('connected', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      onEvent({ type: 'connected', data });
    } catch (error) {
      console.error('Failed to parse SSE connected event:', error);
    }
  });
  
  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    onEvent({ type: 'error', data: { error: 'Connection error' } });
  };
  
  // Return cleanup function
  return () => {
    eventSource.close();
  };
}

export const apiClient = {
  fetchTrips,
  fetchTrip,
  fetchDay,
  resolveMediaUrl,
  uploadTripWithPhotos,
  deleteTrip,
  deleteAllOtherTrips,
  cancelTripProcessing,
  startNarration,
  getNarrationState,
  getPhotoContext,
  getPhotoQuestions,
  submitNarrationAnswer,
  completeNarration,
  connectToTripStatusStream,
};

