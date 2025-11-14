/**
 * Processing status enum
 */
export enum ProcessingStatus {
  NOT_STARTED = 'not_started',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Trip entity
 */
export interface Trip {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  overview: TripOverview | null;
  processingStatus: ProcessingStatus;
  narrationState: NarrationState | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Photo entity
 */
export interface Photo {
  id: string;
  tripId: string;
  filename: string;
  filePath: string;
  fileUrl: string | null;
  capturedAt: Date | null;
  uploadedAt: Date;
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
  exifData: EXIFData | null;
  processingStatus: ProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Day itinerary entity
 */
export interface DayItinerary {
  id: string;
  tripId: string;
  dayNumber: number;
  date: Date;
  summary: DayItinerarySummary;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI-generated photo description (JSONB structure)
 */
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

/**
 * AI-generated day itinerary summary (JSONB structure)
 */
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

/**
 * AI-generated trip overview (JSONB structure)
 */
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

/**
 * Destination within a trip overview
 */
export interface Destination {
  name: string;
  days: number[];
  highlights: string[];
}

/**
 * EXIF metadata (JSONB structure)
 */
export interface EXIFData {
  make?: string;
  model?: string;
  dateTime?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  fNumber?: number;
  exposureTime?: string;
  iso?: number;
  focalLength?: number;
  lensModel?: string;
  orientation?: number;
  imageWidth?: number;
  imageHeight?: number;
  [key: string]: unknown;
}

/**
 * Location data from geocoding
 */
export interface LocationData {
  country?: string;
  city?: string;
  neighborhood?: string;
  landmark?: string;
  fullAddress?: string;
  latitude: number;
  longitude: number;
  source: 'exif' | 'geocoding' | 'llm_visual';
  confidence?: number;
}

/**
 * Create trip input
 */
export interface CreateTripData {
  name: string;
  startDate?: Date;
}

/**
 * Update trip input
 */
export interface UpdateTripData {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  overview?: TripOverview;
  processingStatus?: ProcessingStatus;
  narrationState?: NarrationState;
}

/**
 * Create photo input
 */
export interface CreatePhotoData {
  tripId: string;
  filename: string;
  filePath: string;
  fileUrl?: string;
  capturedAt?: Date;
  exifData?: EXIFData;
}

/**
 * Create day itinerary input
 */
export interface CreateDayItineraryData {
  tripId: string;
  dayNumber: number;
  date: Date;
  summary: DayItinerarySummary;
}

/**
 * API Success Response
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * API Error Response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * API Response type
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Narration wizard state
 */
export interface NarrationState {
  enabled: boolean;
  status: 'not_started' | 'in_progress' | 'completed';
  currentDayNumber?: number;
  currentPhotoIndex?: number;
  completedDays: number[];
  completedPhotos: string[]; // photo IDs
}

/**
 * Narration question for a photo
 */
export interface NarrationQuestion {
  id: string;
  photoId: string;
  dayNumber: number;
  question: string;
  context: {
    photoDescription: PhotoDescription;
    location?: {
      city?: string;
      country?: string;
      landmark?: string;
    };
    timeOfDay?: string;
  };
  type: 'location' | 'activity' | 'context' | 'emotion' | 'people';
}

/**
 * Narration answer
 */
export interface NarrationAnswer {
  questionId: string;
  photoId: string;
  dayNumber: number;
  answer: string; // Transcribed from audio or typed
  audioUrl?: string;
  timestamp: Date;
}

/**
 * Photo context for narration (what to show user)
 */
export interface PhotoNarrationContext {
  photo: Photo;
  description: PhotoDescription;
  location: {
    city?: string;
    country?: string;
    landmark?: string;
  };
  summary: string; // Brief summary: "Here's what we detected in this image..."
}

/**
 * Create narration answer input
 */
export interface CreateNarrationAnswerData {
  tripId: string;
  photoId: string;
  dayNumber: number;
  questionId: string;
  questionText: string;
  answerText: string;
  answerAudioUrl?: string;
}

