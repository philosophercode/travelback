export type ProcessingStatus =
  | 'not_started'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface Destination {
  name: string;
  days: number[];
  highlights: string[];
}

export interface TripOverview {
  title: string;
  summary: string;
  destinations: Destination[];
  themes: string[];
  totalDays: number;
  totalPhotos: number;
  topMoments: string[];
  travelStyle?: string;
}

export interface NarrationState {
  enabled: boolean;
  status: 'not_started' | 'in_progress' | 'completed';
  currentDayNumber?: number;
  currentPhotoIndex?: number;
  completedDays: number[];
  completedPhotos: string[];
}

export interface Trip {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  overview: TripOverview | null;
  processingStatus: ProcessingStatus;
  narrationState: NarrationState | null;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl?: string | null;
}

export interface PhotoDescription {
  mainSubject: string;
  setting: string;
  activities: string[];
  mood: string;
  timeOfDay: string;
  weather: string;
  notableDetails: string[];
  visualQuality: string;
}

export interface Photo {
  id: string;
  tripId: string;
  filename: string;
  filePath: string;
  fileUrl: string | null;
  capturedAt: string | null;
  uploadedAt: string;
  dayNumber: number | null;
  description: PhotoDescription | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  locationCountry: string | null;
  locationCity: string | null;
  locationNeighborhood: string | null;
  locationLandmark: string | null;
  locationFullAddress: string | null;
  locationSource: 'exif' | 'geocoding' | 'llm_visual' | null;
  locationConfidence: number | null;
  processingStatus: ProcessingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DayItinerarySummary {
  title: string;
  narrative: string;
  highlights: string[];
  locations: string[];
  activities: string[];
  startTime: string;
  endTime: string;
  totalDistance: number;
}

export interface DayItinerary {
  id: string;
  tripId: string;
  dayNumber: number;
  date: string;
  summary: DayItinerarySummary;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface TripResponse {
  trip: Trip;
  days: DayItinerary[];
  totalPhotos: number;
}

export interface DayWithPhotos {
  day: DayItinerary;
  photos: Photo[];
}

export interface ProcessingProgress {
  step: 'photos' | 'clustering' | 'itineraries' | 'overview';
  total?: number;
  completed?: number;
  current?: number | null;
  message: string;
}

