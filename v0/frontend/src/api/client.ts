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

async function request<T>(path: string): Promise<T> {
  const url = withBase(path);

  let response: Response;
  try {
    response = await fetch(url);
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

export const apiClient = {
  fetchTrips,
  fetchTrip,
  fetchDay,
  resolveMediaUrl,
  uploadTripWithPhotos,
};

