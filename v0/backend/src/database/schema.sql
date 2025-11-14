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

