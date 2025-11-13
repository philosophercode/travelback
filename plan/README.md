# TravelBack

AI-powered trip photo organizer that turns your travel photos into beautifully narrated stories.

## Overview

TravelBack is a backend API that processes your trip photos using AI to:

1. **Extract metadata** - Pull EXIF data (location, timestamp, camera info)
2. **Describe photos** - Use vision AI to generate rich descriptions
3. **Locate photos** - Reverse geocode GPS coordinates or identify landmarks visually
4. **Cluster by day** - Automatically group photos into daily itineraries
5. **Generate summaries** - Create narrative summaries for each day and the entire trip

### What You Get

**Input**: Batch of travel photos from your trip

**Output**:
- 📸 **Each Photo**: Rich description + human-readable location + EXIF data
- 📅 **Each Day**: Narrative itinerary with highlights, locations, and activities
- 🗺️ **Overall Trip**: Comprehensive overview with themes, destinations, and top moments

All outputs are **structured JSON** stored in PostgreSQL, making it easy to build any frontend.

---

## Features

### ✅ Current (MVP)
- Photo upload API with multipart/form-data
- EXIF metadata extraction (GPS, camera, timestamp)
- Location intelligence:
  - Reverse geocoding (GPS → "Eiffel Tower, Paris, France")
  - Visual location detection (no GPS → AI guesses from image)
- AI image description with structured JSON output
- Automatic day clustering based on capture timestamps
- Day itinerary generation with narrative flow
- Trip overview with themes and highlights
- PostgreSQL database with JSONB for flexibility
- Flexible LLM provider (easy to swap models/providers)
- Local and cloud storage support

### 🚧 Planned
- User authentication & authorization
- Photo tagging and search
- Trip sharing
- Webhook notifications
- Background job queue (BullMQ)
- Rate limiting
- Photo editing/enhancement

---

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| **Runtime** | Node.js 20+ | Modern, stable, great ecosystem |
| **Language** | TypeScript | Type safety, better DX |
| **Framework** | Express | Simple, flexible, battle-tested |
| **Database** | PostgreSQL 16 | Powerful, JSONB support, free tier |
| **AI Provider** | OpenAI | Best vision models, structured outputs |
| **Models** | gpt-4o-mini | Fast, cheap ($0.45/100 photos), good quality |
| **Geocoding** | Nominatim | Free, no API key, OpenStreetMap data |
| **Storage** | Local/Supabase | Easy local dev, seamless cloud deploy |
| **Image Processing** | Sharp | Fast, efficient, format conversion |
| **EXIF Extraction** | exifr | Complete EXIF/IPTC/XMP support |

---

## Project Structure

```
travelback/
├── src/
│   ├── server.ts                          # Express app entry point
│   ├── config.ts                          # Environment configuration
│   │
│   ├── routes/
│   │   └── trips.routes.ts                # REST API endpoints
│   │
│   ├── controllers/
│   │   └── trips.controller.ts            # Request/response handlers
│   │
│   ├── services/
│   │   ├── storage.service.ts             # File storage (local/cloud)
│   │   ├── exif.service.ts                # EXIF metadata extraction
│   │   ├── location.service.ts            # Geocoding & location
│   │   └── processing.service.ts          # Pipeline orchestration
│   │
│   ├── agents/
│   │   ├── llm-provider.ts                # Abstract LLM interface
│   │   ├── openai-provider.ts             # OpenAI implementation
│   │   ├── image-description.agent.ts     # Photo → Description
│   │   ├── day-itinerary.agent.ts         # Photos → Day summary
│   │   └── trip-overview.agent.ts         # Days → Trip overview
│   │
│   ├── database/
│   │   ├── db.ts                          # PostgreSQL connection
│   │   ├── schema.sql                     # Database schema
│   │   └── repositories/
│   │       ├── trip.repository.ts         # Trip CRUD
│   │       ├── photo.repository.ts        # Photo CRUD
│   │       └── itinerary.repository.ts    # Itinerary CRUD
│   │
│   ├── types/
│   │   └── index.ts                       # TypeScript interfaces
│   │
│   ├── middleware/
│   │   ├── error-handler.ts               # Global error handling
│   │   ├── upload.ts                      # Multer file upload
│   │   └── async-handler.ts               # Async route wrapper
│   │
│   └── utils/
│       └── logger.ts                      # Logging utility
│
├── uploads/                               # Local photo storage (dev)
├── .env                                   # Environment variables
├── .env.example                           # Example configuration
├── docker-compose.yml                     # Local PostgreSQL
├── package.json
├── tsconfig.json
├── ARCHITECTURE.md                        # System architecture docs
├── DATABASE_SCHEMA.md                     # Database schema docs
└── README.md                              # This file
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- Docker (for local PostgreSQL)
- OpenAI API key

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Required
DATABASE_URL=postgresql://postgres:dev123@localhost:5432/travelback
OPENAI_API_KEY=sk-proj-your-key-here

# Optional (defaults shown)
PORT=3000
LLM_TEXT_MODEL=gpt-4o-mini
LLM_VISION_MODEL=gpt-4o-mini
STORAGE_PROVIDER=local
MAX_CONCURRENT_PHOTOS=3
```

### 3. Start PostgreSQL

```bash
docker-compose up -d
```

### 4. Setup Database

```bash
npm run db:setup
```

### 5. Start Development Server

```bash
npm run dev
```

Server running at `http://localhost:3000` 🚀

---

## API Endpoints

### 1. Create Trip

```http
POST /api/trips
Content-Type: application/json

{
  "name": "Summer in Europe",
  "startDate": "2024-06-01"  // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Summer in Europe",
    "processingStatus": "not_started",
    "createdAt": "2024-06-15T10:00:00Z"
  }
}
```

### 2. Upload Photos

```http
POST /api/trips/:tripId/photos
Content-Type: multipart/form-data

photos: [file1.jpg, file2.jpg, ...]
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uploadedCount": 25,
    "photos": [
      {
        "id": "photo-uuid-1",
        "filename": "IMG_1234.jpg",
        "capturedAt": "2024-06-15T14:30:00Z",
        "locationLatitude": 48.858844,
        "locationLongitude": 2.294351,
        "processingStatus": "pending"
      }
    ]
  }
}
```

### 3. Process Trip

Triggers AI processing pipeline.

```http
POST /api/trips/:tripId/process
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "processing",
    "message": "Processing started for 25 photos",
    "estimatedTime": "2-3 minutes"
  }
}
```

### 4. Get Trip Details

```http
GET /api/trips/:tripId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "trip": {
      "id": "trip-uuid",
      "name": "Summer in Europe",
      "startDate": "2024-06-15",
      "endDate": "2024-06-20",
      "overview": {
        "title": "A Week in Paris",
        "summary": "An unforgettable journey...",
        "destinations": [
          {
            "name": "Paris, France",
            "days": [1, 2, 3, 4, 5],
            "highlights": ["Eiffel Tower", "Louvre"]
          }
        ],
        "themes": ["culture", "architecture"],
        "totalDays": 5,
        "totalPhotos": 127,
        "topMoments": ["Sunset at Eiffel Tower"]
      },
      "processingStatus": "completed"
    },
    "days": [
      {
        "dayNumber": 1,
        "date": "2024-06-15",
        "summary": {
          "title": "Exploring Historic Paris",
          "highlights": ["Eiffel Tower visit", "Seine walk"],
          "locations": ["Eiffel Tower", "Le Marais"]
        },
        "photoCount": 23
      }
    ],
    "totalPhotos": 127
  }
}
```

### 5. Get Day Details

```http
GET /api/trips/:tripId/days/:dayNumber
```

**Response:**
```json
{
  "success": true,
  "data": {
    "day": {
      "dayNumber": 1,
      "date": "2024-06-15",
      "summary": {
        "title": "Exploring Historic Paris",
        "narrative": "The day began with a breathtaking...",
        "highlights": ["..."],
        "locations": ["Eiffel Tower", "Louvre"],
        "activities": ["sightseeing", "photography"],
        "startTime": "07:30 AM",
        "endTime": "10:00 PM",
        "totalDistance": 8.5
      }
    },
    "photos": [
      {
        "id": "photo-uuid",
        "fileUrl": "https://...",
        "capturedAt": "2024-06-15T07:30:00Z",
        "description": {
          "mainSubject": "Eiffel Tower at sunrise",
          "setting": "Urban landmark plaza",
          "activities": ["sightseeing", "photography"],
          "mood": "Awe-inspiring",
          "timeOfDay": "Early morning",
          "weather": "Clear skies",
          "notableDetails": ["Golden light", "Long shadows"],
          "visualQuality": "excellent"
        },
        "location": {
          "landmark": "Eiffel Tower",
          "neighborhood": "Champ de Mars",
          "city": "Paris",
          "country": "France",
          "latitude": 48.858844,
          "longitude": 2.294351,
          "source": "geocoding",
          "confidence": 1.0
        }
      }
    ]
  }
}
```

---

## Configuration

### Environment Variables

See `.env.example` for all options.

#### Required
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API key

#### Optional
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `LLM_TEXT_MODEL` - OpenAI text model (default: gpt-4o-mini)
- `LLM_VISION_MODEL` - OpenAI vision model (default: gpt-4o-mini)
- `LLM_TEMPERATURE` - Model temperature (default: 0.7)
- `LLM_MAX_TOKENS` - Max tokens per request (default: 2000)
- `STORAGE_PROVIDER` - local or supabase (default: local)
- `UPLOAD_DIR` - Local storage directory (default: ./uploads)
- `MAX_FILE_SIZE_MB` - Max upload size (default: 10)
- `MAX_CONCURRENT_PHOTOS` - Parallel processing limit (default: 3)

### Model Options

| Model | Speed | Cost | Quality | Use Case |
|-------|-------|------|---------|----------|
| `gpt-4o-mini` | ⚡⚡⚡ | 💰 | ⭐⭐⭐ | ✅ **Default** - Best value |
| `gpt-4o` | ⚡⚡ | 💰💰💰 | ⭐⭐⭐⭐⭐ | Premium quality |
| `gpt-4-turbo` | ⚡ | 💰💰💰💰 | ⭐⭐⭐⭐ | Previous gen |

**Cost Example (100 photos):**
- gpt-4o-mini: ~$0.45
- gpt-4o: ~$3-5

---

## Deployment

### Local Development

```bash
# Start database
docker-compose up -d

# Run migrations
npm run db:setup

# Start server
npm run dev
```

### Production (Supabase + Railway/Render)

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Copy database connection string

2. **Setup Database**
   ```bash
   psql "postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres" < src/database/schema.sql
   ```

3. **Deploy API**
   - Push code to GitHub
   - Connect to Railway/Render/Vercel
   - Set environment variables:
     ```bash
     DATABASE_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres
     OPENAI_API_KEY=sk-proj-...
     NODE_ENV=production
     STORAGE_PROVIDER=supabase  # optional
     ```

4. **Deploy!**
   - Railway/Render auto-deploys from GitHub
   - API available at provided URL

**Zero code changes needed!** Just swap the `DATABASE_URL`.

---

## Development

### Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Compile TypeScript to JavaScript
npm start            # Run production build
npm run db:setup     # Initialize database schema
```

### Project Commands

```bash
# Database
docker-compose up -d              # Start PostgreSQL
docker-compose down               # Stop PostgreSQL
docker-compose logs postgres      # View logs

# Database operations
psql $DATABASE_URL                # Connect to database
psql $DATABASE_URL -f schema.sql  # Run SQL file

# Backup/restore
pg_dump $DATABASE_URL > backup.sql
psql $DATABASE_URL < backup.sql
```

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design.

### Processing Pipeline

```
Upload Photos → Extract EXIF → Describe Each Photo → Cluster by Day → Generate Day Summaries → Create Trip Overview
```

### Layers

1. **Routes** - HTTP endpoints
2. **Controllers** - Request/response handling
3. **Services** - Business logic
4. **Agents** - AI processing (LLM interactions)
5. **Repositories** - Database access

### Design Principles

- **Separation of Concerns** - Each layer has one responsibility
- **Provider Pattern** - Easy to swap LLMs, storage, etc.
- **Type Safety** - Full TypeScript with strict mode
- **Structured Data** - All AI outputs are typed JSON
- **Async Processing** - Non-blocking photo processing
- **Graceful Degradation** - Partial failures don't stop pipeline

---

## Database

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema.

### Tables

- **trips** - Trip metadata and AI overview
- **photos** - Photo files, EXIF, descriptions, locations
- **day_itineraries** - Daily summaries with structured data

### Key Features

- UUID primary keys
- JSONB for flexible AI outputs
- GIN indexes for JSON search
- Foreign key cascades
- Timestamp tracking

---

## Cost Estimation

### OpenAI (gpt-4o-mini)

| Scale | Photos | Cost |
|-------|--------|------|
| Small trip | 50 | ~$0.23 |
| Medium trip | 200 | ~$0.90 |
| Large trip | 500 | ~$2.25 |
| 100 users × 3 trips × 100 photos | 30,000 | ~$135/mo |

### Infrastructure

| Service | Plan | Cost |
|---------|------|------|
| Supabase PostgreSQL | Free tier | $0 (500MB) |
| Supabase Storage | Free tier | $0 (1GB) |
| Railway API hosting | Hobby | $5/mo |
| **Total** | | **$5/mo + usage** |

---

## Roadmap

### Phase 1: MVP ✅ (Current)
- Photo upload & storage
- EXIF extraction
- AI descriptions
- Location intelligence
- Day clustering
- Trip summaries

### Phase 2: Authentication 🚧
- User registration/login
- JWT tokens
- Trip ownership
- Private/public trips

### Phase 3: Enhanced Features 📋
- Photo search (by location, activity, etc.)
- Manual photo editing
- Trip sharing
- Export to PDF
- Mobile app API

### Phase 4: Scale 📋
- Background job queue
- CDN for photos
- Caching layer
- Rate limiting
- Webhooks

---

## Contributing

This is a personal project, but suggestions and improvements are welcome!

### How to Contribute

1. Fork the repo
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

---

## Support
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/travelback/issues)
- 📚 Docs: [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

---

## Acknowledgments

- OpenAI for GPT-4o models
- OpenStreetMap for free geocoding via Nominatim
- Supabase for generous free tier
- The open-source community

---

Made with ❤️ for travelers who want their photos to tell stories.

