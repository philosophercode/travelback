# TravelBack - Database Schema

## Overview

PostgreSQL database schema for storing trips, photos, and AI-generated content.

## Entity Relationship Diagram

```
┌─────────────────┐
│     trips       │
│─────────────────│
│ id (PK)         │
│ name            │
│ start_date      │
│ end_date        │
│ overview (JSON) │
│ processing_     │
│   status        │
│ created_at      │
│ updated_at      │
└────────┬────────┘
         │
         │ 1:N
         │
         ├─────────────────────────────┐
         │                             │
         ▼                             ▼
┌────────────────────┐      ┌─────────────────────┐
│       photos       │      │  day_itineraries    │
│────────────────────│      │─────────────────────│
│ id (PK)            │      │ id (PK)             │
│ trip_id (FK)       │      │ trip_id (FK)        │
│ filename           │      │ day_number          │
│ file_path          │      │ date                │
│ file_url           │      │ summary (JSON)      │
│ captured_at        │      │ created_at          │
│ day_number         │      │ updated_at          │
│ description (JSON) │      └─────────────────────┘
│ location_*         │
│ exif_data (JSON)   │
│ processing_status  │
│ created_at         │
│ updated_at         │
└────────────────────┘
```

## Tables

### 1. trips

Stores trip metadata and overall AI-generated overview.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique trip identifier |
| `name` | VARCHAR(255) | NOT NULL | User-provided trip name |
| `start_date` | DATE | NULL | Trip start date (auto-detected from photos) |
| `end_date` | DATE | NULL | Trip end date (auto-detected from photos) |
| `overview` | JSONB | NULL | AI-generated trip overview (structured JSON) |
| `processing_status` | VARCHAR(20) | DEFAULT 'not_started' | Status: not_started, processing, completed, failed |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `processing_status` for filtering

**Example `overview` JSON:**
```json
{
  "title": "A Week in Paris",
  "summary": "An unforgettable journey through the heart of France...",
  "destinations": [
    {
      "name": "Paris, France",
      "days": [1, 2, 3, 4, 5],
      "highlights": ["Eiffel Tower", "Louvre Museum", "Notre Dame"]
    }
  ],
  "themes": ["culture", "architecture", "cuisine", "history"],
  "totalDays": 5,
  "totalPhotos": 127,
  "topMoments": [
    "Sunrise at Eiffel Tower",
    "Louvre Museum visit",
    "Seine River sunset cruise"
  ],
  "travelStyle": "Cultural immersion with urban exploration"
}
```

---

### 2. photos

Stores individual photo records with EXIF metadata, location data, and AI-generated descriptions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique photo identifier |
| `trip_id` | UUID | FOREIGN KEY → trips(id) ON DELETE CASCADE | Parent trip |
| `filename` | VARCHAR(255) | NOT NULL | Original filename |
| `file_path` | TEXT | NOT NULL | Storage path (local or cloud) |
| `file_url` | TEXT | NULL | Public URL to access photo |
| `captured_at` | TIMESTAMP | NULL | When photo was taken (from EXIF) |
| `uploaded_at` | TIMESTAMP | DEFAULT NOW() | When photo was uploaded |
| `day_number` | INTEGER | NULL | Which day of trip (1, 2, 3, ...) |
| `description` | JSONB | NULL | AI-generated structured description |
| `location_latitude` | DECIMAL(10, 8) | NULL | GPS latitude from EXIF |
| `location_longitude` | DECIMAL(11, 8) | NULL | GPS longitude from EXIF |
| `location_country` | VARCHAR(100) | NULL | Country name (geocoded or AI) |
| `location_city` | VARCHAR(100) | NULL | City name |
| `location_neighborhood` | VARCHAR(100) | NULL | Neighborhood/district |
| `location_landmark` | VARCHAR(255) | NULL | Specific landmark name |
| `location_full_address` | TEXT | NULL | Complete address string |
| `location_source` | VARCHAR(20) | NULL | Source: exif, geocoding, llm_visual |
| `location_confidence` | DECIMAL(3, 2) | NULL | Confidence 0.00-1.00 (for AI guesses) |
| `exif_data` | JSONB | NULL | Full EXIF metadata |
| `processing_status` | VARCHAR(20) | DEFAULT 'pending' | Status: pending, processing, completed, failed |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Foreign key index on `trip_id`
- Index on `captured_at` for chronological sorting
- Index on `day_number` for day-based queries
- Index on `location_city` for location filtering
- Index on `location_country` for country filtering
- GIN index on `description` for full-text search in JSON
- GIN index on `exif_data` for EXIF queries

**Example `description` JSON:**
```json
{
  "mainSubject": "Eiffel Tower illuminated at sunset",
  "setting": "Urban landmark plaza with tourists and vendors",
  "activities": ["sightseeing", "photography", "tourism"],
  "mood": "Awe-inspiring and romantic",
  "timeOfDay": "Golden hour / sunset",
  "weather": "Clear skies with scattered clouds",
  "notableDetails": [
    "Iron lattice structure in sharp detail",
    "Warm golden light on the tower",
    "Long shadows across the plaza",
    "Birds flying past the spire"
  ],
  "visualQuality": "excellent"
}
```

**Example `exif_data` JSON:**
```json
{
  "make": "Apple",
  "model": "iPhone 14 Pro",
  "dateTime": "2024-06-15T18:30:45",
  "latitude": 48.858844,
  "longitude": 2.294351,
  "altitude": 35.5,
  "fNumber": 1.78,
  "exposureTime": "1/250",
  "iso": 100,
  "focalLength": 6.86,
  "lensModel": "iPhone 14 Pro back triple camera 6.86mm f/1.78",
  "orientation": 1,
  "imageWidth": 4032,
  "imageHeight": 3024
}
```

---

### 3. day_itineraries

Stores AI-generated summaries for each day of a trip.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique itinerary identifier |
| `trip_id` | UUID | FOREIGN KEY → trips(id) ON DELETE CASCADE | Parent trip |
| `day_number` | INTEGER | NOT NULL | Day number (1, 2, 3, ...) |
| `date` | DATE | NOT NULL | Actual calendar date |
| `summary` | JSONB | NOT NULL | AI-generated day summary |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Constraints:**
- Unique constraint on `(trip_id, day_number)` - one itinerary per day per trip

**Indexes:**
- Primary key on `id`
- Foreign key index on `trip_id`
- Unique index on `(trip_id, day_number)`
- GIN index on `summary` for full-text search

**Example `summary` JSON:**
```json
{
  "title": "Exploring Historic Paris",
  "narrative": "The day began with a breathtaking sunrise visit to the Eiffel Tower at 7:30 AM, where the golden morning light created perfect photography conditions. After climbing to the second level, we enjoyed panoramic views of the city awakening below. By mid-morning, we strolled through the charming streets of Le Marais, stopping at a traditional café for croissants and coffee. The afternoon was spent at the Louvre Museum, marveling at masterpieces including the Mona Lisa and Venus de Milo. As evening approached, we walked along the Seine, watching the sunset paint the sky in shades of pink and orange. The day concluded with a delightful dinner at a riverside bistro, savoring classic French cuisine.",
  "highlights": [
    "Sunrise at the Eiffel Tower with stunning golden light",
    "Traditional French breakfast in Le Marais",
    "Louvre Museum - Mona Lisa and classical art",
    "Seine River sunset walk",
    "Authentic French dinner at riverside bistro"
  ],
  "locations": [
    "Eiffel Tower",
    "Le Marais",
    "Louvre Museum",
    "Seine River",
    "Latin Quarter"
  ],
  "activities": [
    "sightseeing",
    "photography",
    "museum visit",
    "dining",
    "walking tour"
  ],
  "startTime": "07:30 AM",
  "endTime": "10:00 PM",
  "totalDistance": 8.5
}
```

---

## SQL Schema Definition

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trips table
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    start_date DATE,
    end_date DATE,
    overview JSONB,
    processing_status VARCHAR(20) DEFAULT 'not_started',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT,
    captured_at TIMESTAMP,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    day_number INTEGER,
    
    -- Structured description (JSONB)
    description JSONB,
    
    -- Location data
    location_latitude DECIMAL(10, 8),
    location_longitude DECIMAL(11, 8),
    location_country VARCHAR(100),
    location_city VARCHAR(100),
    location_neighborhood VARCHAR(100),
    location_landmark VARCHAR(255),
    location_full_address TEXT,
    location_source VARCHAR(20),
    location_confidence DECIMAL(3, 2),
    
    -- EXIF metadata
    exif_data JSONB,
    
    -- Processing status
    processing_status VARCHAR(20) DEFAULT 'pending',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Day itineraries table
CREATE TABLE IF NOT EXISTS day_itineraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    date DATE NOT NULL,
    summary JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(trip_id, day_number)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_photos_trip_id ON photos(trip_id);
CREATE INDEX IF NOT EXISTS idx_photos_captured_at ON photos(captured_at);
CREATE INDEX IF NOT EXISTS idx_photos_day_number ON photos(day_number);
CREATE INDEX IF NOT EXISTS idx_photos_location_city ON photos(location_city);
CREATE INDEX IF NOT EXISTS idx_photos_location_country ON photos(location_country);
CREATE INDEX IF NOT EXISTS idx_photos_processing_status ON photos(processing_status);
CREATE INDEX IF NOT EXISTS idx_day_itineraries_trip_id ON day_itineraries(trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_processing_status ON trips(processing_status);

-- GIN indexes for JSONB full-text search
CREATE INDEX IF NOT EXISTS idx_photos_description ON photos USING GIN (description);
CREATE INDEX IF NOT EXISTS idx_photos_exif_data ON photos USING GIN (exif_data);
CREATE INDEX IF NOT EXISTS idx_day_summary ON day_itineraries USING GIN (summary);
CREATE INDEX IF NOT EXISTS idx_trip_overview ON trips USING GIN (overview);
```

---

## Query Examples

### Get trip with all data
```sql
SELECT 
    t.*,
    COUNT(p.id) as photo_count,
    COUNT(DISTINCT di.id) as day_count,
    MIN(p.captured_at) as actual_start_date,
    MAX(p.captured_at) as actual_end_date
FROM trips t
LEFT JOIN photos p ON p.trip_id = t.id
LEFT JOIN day_itineraries di ON di.trip_id = t.id
WHERE t.id = $1
GROUP BY t.id;
```

### Get all photos for a specific day
```sql
SELECT *
FROM photos
WHERE trip_id = $1 
  AND day_number = $2
ORDER BY captured_at ASC;
```

### Search photos by location
```sql
SELECT *
FROM photos
WHERE location_city ILIKE '%Paris%'
  AND description @> '{"activities": ["sightseeing"]}';
```

### Get photos without processing
```sql
SELECT id, filename, trip_id
FROM photos
WHERE processing_status = 'pending'
ORDER BY uploaded_at ASC
LIMIT 10;
```

### Get day itinerary with photo count
```sql
SELECT 
    di.*,
    COUNT(p.id) as photo_count
FROM day_itineraries di
LEFT JOIN photos p ON p.trip_id = di.trip_id AND p.day_number = di.day_number
WHERE di.trip_id = $1 AND di.day_number = $2
GROUP BY di.id;
```

### Find trips by destination
```sql
SELECT DISTINCT t.*
FROM trips t
JOIN photos p ON p.trip_id = t.id
WHERE p.location_city = 'Paris'
  OR p.location_country = 'France';
```

### Search in descriptions (full-text)
```sql
SELECT *
FROM photos
WHERE description @@ to_tsquery('english', 'tower & sunset');
```

---

## Data Types Rationale

### UUID for Primary Keys
- Globally unique
- No sequential guessing
- Better for distributed systems
- Safer for public APIs

### JSONB for Structured Data
- Flexible schema for LLM outputs
- Fast queries with GIN indexes
- No need for additional tables
- Easy to evolve schema

### DECIMAL for GPS Coordinates
- Higher precision than FLOAT
- Standard for geospatial data
- latitude: DECIMAL(10, 8) = ±180.00000000
- longitude: DECIMAL(11, 8) = ±180.00000000

### VARCHAR vs TEXT
- VARCHAR(n) for short, indexed fields (name, status)
- TEXT for long content (addresses, paths, URLs)

---

## Migration Strategy

### Initial Setup
```bash
# Create database
createdb travelback

# Run schema
psql $DATABASE_URL -f src/database/schema.sql
```

### Future Migrations
Add to `src/database/migrations/` folder:
- `001_add_user_auth.sql` - Add user_id columns
- `002_add_photo_tags.sql` - Add tagging system
- etc.

---

## Backup & Recovery

### Local Development
```bash
# Backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

### Production (Supabase)
- Automatic daily backups
- Point-in-time recovery
- Download backups from dashboard

---

## Performance Considerations

### Indexes
- All foreign keys indexed
- Timestamp columns indexed
- Location columns indexed
- GIN indexes on JSONB for search

### Query Optimization
- Use prepared statements
- Limit result sets
- Paginate large queries
- Use connection pooling

### Monitoring
- Track slow queries (> 1s)
- Monitor index usage
- Check table bloat
- Vacuum regularly (auto in PostgreSQL)

---

## Security

### Current
- Parameterized queries (prevent SQL injection)
- Cascade deletes (data integrity)
- NOT NULL constraints on required fields

### Future (with Auth)
- Row-level security (RLS)
- User-scoped queries
- API rate limiting
- Audit logging

---

## Future Enhancements

### Potential Additions
1. **users table** - Authentication
2. **photo_tags table** - User-defined tags
3. **shared_trips table** - Trip sharing
4. **favorites table** - Favorite photos
5. **comments table** - Photo annotations
6. **trip_collaborators table** - Multi-user trips
7. **processing_jobs table** - Job queue tracking
8. **audit_log table** - Change history

