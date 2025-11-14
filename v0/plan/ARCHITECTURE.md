# TravelBack - System Architecture

## Overview

TravelBack is an AI-powered backend API that processes trip photos, extracts metadata, generates descriptions, and creates narrative summaries for travel experiences.

## High-Level Architecture

```
┌─────────────┐
│   Client    │ (Future: Upload photos)
└──────┬──────┘
       │ HTTP/REST
       ▼
┌─────────────────────────────────────────────────────────────┐
│                     Express API Server                       │
├─────────────────────────────────────────────────────────────┤
│  Routes Layer                                               │
│  ├─ POST /api/trips                                         │
│  ├─ POST /api/trips/:id/photos                             │
│  ├─ POST /api/trips/:id/process                            │
│  ├─ GET  /api/trips/:id                                    │
│  └─ GET  /api/trips/:id/days/:dayNumber                    │
├─────────────────────────────────────────────────────────────┤
│  Controllers Layer                                          │
│  └─ trips.controller.ts (Request/Response handling)         │
├─────────────────────────────────────────────────────────────┤
│  Services Layer (Business Logic)                            │
│  ├─ storage.service.ts (File management)                   │
│  ├─ exif.service.ts (Metadata extraction)                  │
│  ├─ location.service.ts (Geocoding)                        │
│  └─ processing.service.ts (Pipeline orchestration)         │
├─────────────────────────────────────────────────────────────┤
│  Agents Layer (AI Processing)                               │
│  ├─ image-description.agent.ts (Photo → Description)       │
│  ├─ day-itinerary.agent.ts (Photos → Day summary)          │
│  └─ trip-overview.agent.ts (Days → Trip overview)          │
├─────────────────────────────────────────────────────────────┤
│  Repository Layer (Data Access)                             │
│  ├─ trip.repository.ts                                      │
│  ├─ photo.repository.ts                                     │
│  └─ itinerary.repository.ts                                │
└─────────────────────────────────────────────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌────────────┐ ┌───────────┐ ┌──────────────┐
│ PostgreSQL │ │   Local   │ │  OpenAI API  │
│  Database  │ │  Storage  │ │ (gpt-4o-mini)│
└────────────┘ └───────────┘ └──────────────┘
```

## Processing Pipeline

### Phase 1: Photo Upload
```
User uploads photos
    ↓
Express + Multer handles multipart/form-data
    ↓
Storage Service saves files (local/Supabase)
    ↓
EXIF Service extracts metadata
    ↓
Photo Repository saves to database
    ↓
Return photo IDs with status: 'pending'
```

### Phase 2: AI Processing (Async)
```
Trigger processing pipeline
    ↓
┌─────────────────────────────────────────┐
│ Step 1: Describe Each Photo             │
├─────────────────────────────────────────┤
│ For each photo:                         │
│   • Load image file                     │
│   • Extract EXIF data                   │
│   • Get location (geocode or AI guess) │
│   • Send to Image Description Agent     │
│   • Save structured description         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Step 2: Cluster Photos by Day           │
├─────────────────────────────────────────┤
│ • Group photos by EXIF capture date     │
│ • Assign day numbers                    │
│ • Sort chronologically within each day  │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Step 3: Generate Day Itineraries        │
├─────────────────────────────────────────┤
│ For each day:                           │
│   • Collect all photo descriptions      │
│   • Send to Day Itinerary Agent         │
│   • Generate structured summary         │
│   • Save day itinerary                  │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Step 4: Create Trip Overview            │
├─────────────────────────────────────────┤
│ • Collect all day summaries             │
│ • Send to Trip Overview Agent           │
│ • Generate comprehensive overview       │
│ • Save to trip record                   │
└─────────────────────────────────────────┘
    ↓
Processing complete!
```

## Component Details

### 1. Routes Layer
**Responsibility**: HTTP endpoint definitions and routing

**File**: `src/routes/trips.routes.ts`

**Endpoints**:
- `POST /api/trips` - Create new trip
- `POST /api/trips/:id/photos` - Upload photos to trip
- `POST /api/trips/:id/process` - Start AI processing
- `GET /api/trips/:id` - Get trip with overview
- `GET /api/trips/:id/days` - List all day itineraries
- `GET /api/trips/:id/days/:dayNumber` - Get specific day with photos

### 2. Controllers Layer
**Responsibility**: Request validation, response formatting, error handling

**File**: `src/controllers/trips.controller.ts`

**Functions**:
- `createTrip()` - Handle trip creation
- `uploadPhotos()` - Handle photo uploads
- `processTrip()` - Trigger processing pipeline
- `getTrip()` - Return trip data
- `getDayItinerary()` - Return day details

### 3. Services Layer
**Responsibility**: Business logic and orchestration

#### Storage Service
**File**: `src/services/storage.service.ts`
- Save uploaded files (local filesystem or Supabase Storage)
- Generate file URLs
- Delete files
- Provider abstraction (swap local ↔ cloud)

#### EXIF Service
**File**: `src/services/exif.service.ts`
- Extract EXIF metadata from images
- Parse GPS coordinates
- Extract camera info
- Parse timestamps

#### Location Service
**File**: `src/services/location.service.ts`
- Reverse geocode GPS coordinates → human-readable address
- Use Nominatim (OpenStreetMap) API
- Parse location components (city, country, landmark, etc.)

#### Processing Service
**File**: `src/services/processing.service.ts`
- Orchestrate entire processing pipeline
- Coordinate between agents and repositories
- Handle concurrent processing
- Manage processing status

### 4. Agents Layer (AI Processing)
**Responsibility**: LLM interactions with structured outputs

#### Abstract Provider
**File**: `src/agents/llm-provider.ts`
- Interface definition for any LLM provider
- Standardized input/output
- JSON mode support

#### OpenAI Provider
**File**: `src/agents/openai-provider.ts`
- Concrete implementation for OpenAI
- Uses `gpt-4o-mini` by default
- Handles text and vision models
- JSON structured outputs

#### Image Description Agent
**File**: `src/agents/image-description.agent.ts`

**Input**: Image (base64) + EXIF data

**Process**:
1. Determine location (geocode GPS or AI guess from image)
2. Build context from EXIF
3. Send to vision LLM with structured prompt
4. Parse JSON response

**Output**: Structured `PhotoDescription`
```json
{
  "mainSubject": "Eiffel Tower at sunset",
  "setting": "Urban landmark with tourists",
  "activities": ["sightseeing", "photography"],
  "mood": "Awe-inspiring and romantic",
  "timeOfDay": "Golden hour",
  "weather": "Clear skies",
  "notableDetails": ["Iron lattice", "Pink sky"],
  "visualQuality": "excellent"
}
```

#### Day Itinerary Agent
**File**: `src/agents/day-itinerary.agent.ts`

**Input**: Array of photos from one day (with descriptions)

**Process**:
1. Sort photos chronologically
2. Extract key info (locations, activities, times)
3. Send to text LLM
4. Parse JSON response

**Output**: Structured `DayItinerarySummary`
```json
{
  "title": "Exploring Paris Landmarks",
  "narrative": "The day began at sunrise...",
  "highlights": ["Eiffel Tower visit", "Seine river walk"],
  "locations": ["Eiffel Tower", "Louvre", "Notre Dame"],
  "activities": ["sightseeing", "photography", "dining"],
  "startTime": "07:30 AM",
  "endTime": "10:00 PM",
  "totalDistance": 8.5
}
```

#### Trip Overview Agent
**File**: `src/agents/trip-overview.agent.ts`

**Input**: All day itinerary summaries

**Process**:
1. Extract destinations and themes
2. Identify highlights
3. Send to text LLM
4. Parse JSON response

**Output**: Structured `TripOverview`
```json
{
  "title": "A Week in Paris",
  "summary": "An unforgettable journey through...",
  "destinations": [
    {
      "name": "Paris, France",
      "days": [1, 2, 3, 4, 5],
      "highlights": ["Eiffel Tower", "Louvre Museum"]
    }
  ],
  "themes": ["culture", "architecture", "cuisine"],
  "totalDays": 5,
  "totalPhotos": 127,
  "topMoments": ["Sunset at Eiffel Tower", "Louvre visit"],
  "travelStyle": "Cultural immersion with urban exploration"
}
```

### 5. Repository Layer
**Responsibility**: Database operations (CRUD)

#### Trip Repository
**File**: `src/database/repositories/trip.repository.ts`
- `create()` - Create new trip
- `findById()` - Get trip by ID
- `update()` - Update trip details
- `updateOverview()` - Save trip overview
- `updateProcessingStatus()` - Update status

#### Photo Repository
**File**: `src/database/repositories/photo.repository.ts`
- `create()` - Save photo record
- `createMany()` - Bulk insert photos
- `findById()` - Get photo by ID
- `findByTrip()` - Get all photos for trip
- `findByDay()` - Get photos for specific day
- `updateDescription()` - Save AI description
- `updateLocation()` - Save location data
- `updateProcessingStatus()` - Update status

#### Itinerary Repository
**File**: `src/database/repositories/itinerary.repository.ts`
- `create()` - Save day itinerary
- `findByTrip()` - Get all days for trip
- `findByDayNumber()` - Get specific day
- `update()` - Update itinerary

## Technology Stack

### Core
- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.3
- **Framework**: Express 4.x
- **Database**: PostgreSQL 16

### AI/ML
- **LLM Provider**: OpenAI API
- **Text Model**: `gpt-4o-mini` (configurable)
- **Vision Model**: `gpt-4o-mini` (configurable)
- **Image Processing**: `sharp` (resize, optimize)
- **EXIF Extraction**: `exifr`

### Storage
- **Local Dev**: Filesystem (`./uploads`)
- **Production**: Supabase Storage (S3-compatible)
- **Abstraction**: Provider pattern for easy swapping

### Geocoding
- **Service**: Nominatim (OpenStreetMap)
- **Cost**: Free, no API key required
- **Fallback**: LLM visual location detection

### Database Client
- **Driver**: `pg` (node-postgres)
- **Connection**: Connection pool
- **Migrations**: Manual SQL scripts

## Configuration & Flexibility

### LLM Provider Abstraction
```typescript
// Easy to swap providers
interface LLMProvider {
  generateText(messages, options): Promise<LLMResponse>
  generateVisionText(image, prompt, options): Promise<LLMResponse>
}

// Current: OpenAI only
// Future: Add AnthropicProvider, GeminiProvider, etc.
```

### Model Configuration
```bash
# .env - Change models without code changes
LLM_TEXT_MODEL=gpt-4o-mini      # or gpt-4o, gpt-4-turbo
LLM_VISION_MODEL=gpt-4o-mini    # or gpt-4o
```

### Storage Abstraction
```typescript
interface StorageProvider {
  save(file, path): Promise<string>
  getUrl(path): Promise<string>
  delete(path): Promise<void>
}

// Implementations: LocalStorage, SupabaseStorage
```

## Deployment Architecture

### Local Development
```
Docker Compose (PostgreSQL)
    ↓
Express Server (localhost:3000)
    ↓
Local file storage (./uploads)
```

### Production
```
Supabase PostgreSQL
    ↓
Express Server (Railway/Render/Vercel)
    ↓
Supabase Storage (S3-compatible)
```

**Swap**: Just change `DATABASE_URL` environment variable!

## Scalability Considerations

### Current (MVP)
- Synchronous processing
- Single server
- File-based storage
- Direct LLM calls

### Future Enhancements
1. **Queue System**: Add BullMQ + Redis for background jobs
2. **Caching**: Redis for trip data
3. **CDN**: CloudFront/Cloudflare for images
4. **Microservices**: Split agents into separate services
5. **Load Balancing**: Multiple API instances
6. **Database**: Read replicas, connection pooling
7. **Rate Limiting**: Per-user API limits
8. **Webhooks**: Notify clients when processing completes

## Security (Future)

### Authentication (Not Yet Implemented)
Will add middleware:
```typescript
router.post('/trips', authenticate, authorize, createTrip)
```

Options:
- JWT tokens
- Passport.js
- Auth0
- Clerk
- Supabase Auth

### Authorization
Add `user_id` column to trips and photos tables:
```sql
ALTER TABLE trips ADD COLUMN user_id UUID;
CREATE INDEX idx_trips_user_id ON trips(user_id);
```

## Error Handling

### Levels
1. **Route Level**: Try-catch in controllers
2. **Service Level**: Business logic errors
3. **Agent Level**: LLM failures, retries
4. **Global**: Express error middleware

### Graceful Degradation
- If LLM fails → Mark photo as `failed`, continue with others
- If geocoding fails → Use raw coordinates or unknown
- If visual location fails → Leave location empty

## Monitoring & Observability (Future)

- Logging: Winston or Pino
- Metrics: Prometheus
- Tracing: OpenTelemetry
- Errors: Sentry
- LLM Costs: Track token usage per trip

## API Response Format

### Success
```json
{
  "success": true,
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "PROCESSING_FAILED",
    "message": "Failed to process photo",
    "details": { ... }
  }
}
```

## Development Workflow

1. **Start Database**: `docker-compose up -d`
2. **Run Migrations**: `npm run db:setup`
3. **Start Server**: `npm run dev`
4. **Test Endpoints**: Use Postman/curl
5. **Check Logs**: Console output

## Testing Strategy (Future)

- **Unit Tests**: Services and agents (mock LLM)
- **Integration Tests**: Full pipeline with test images
- **E2E Tests**: API endpoints
- **Load Tests**: Concurrent photo processing

## Performance Targets

- Photo upload: < 1s per photo
- EXIF extraction: < 100ms per photo
- Image description: < 5s per photo (LLM call)
- Day itinerary: < 10s per day
- Trip overview: < 15s per trip
- API response time: < 200ms (non-processing endpoints)

## Cost Estimation (OpenAI gpt-4o-mini)

Per 100 photos:
- Image descriptions: ~$0.30
- Day itineraries (5 days): ~$0.10
- Trip overview: ~$0.05
- **Total**: ~$0.45 per 100 photos

Scale:
- 1,000 users × 5 trips × 50 photos = 250,000 photos
- Cost: ~$1,125/month in LLM fees

## Project Structure
```
travelback/
├── src/
│   ├── server.ts                  # Express app entry point
│   ├── config.ts                  # Configuration loader
│   ├── routes/                    # API routes
│   ├── controllers/               # Request handlers
│   ├── services/                  # Business logic
│   ├── agents/                    # AI processing
│   ├── database/                  # DB connection & repos
│   ├── types/                     # TypeScript interfaces
│   ├── middleware/                # Express middleware
│   └── utils/                     # Helper functions
├── uploads/                       # Local file storage
├── .env                          # Environment variables
├── docker-compose.yml            # Local PostgreSQL
├── package.json
├── tsconfig.json
└── README.md
```

