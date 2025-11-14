# TravelBack Frontend

A simple, clean UI for viewing trip photos, AI-generated descriptions, day itineraries, and trip overviews.

## Features

- **Trip Selector**: Choose from all available trips in the database
- **Trip Overview**: View the AI-generated trip summary, themes, destinations, and top moments
- **Day-by-Day View**: Browse each day's narrative, highlights, locations, and activities
- **Photo Gallery**: View photos with their AI-generated descriptions, locations, and metadata

## Getting Started

### Prerequisites

- Node.js 20+ 
- Backend API running on `http://localhost:3000` (or configure `VITE_API_BASE_URL`)

### Installation

```bash
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173` (or the next available port).

### Configuration

By default, the frontend connects to `http://localhost:3000`. To change this, create a `.env` file:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── api/
│   └── client.ts          # API client functions
├── components/
│   ├── TripSelector.tsx    # Trip dropdown selector
│   ├── TripOverview.tsx    # Trip overview display
│   ├── DayView.tsx         # Day itinerary with photos
│   └── PhotoView.tsx       # Individual photo with description
├── types.ts                # TypeScript type definitions
├── App.tsx                 # Main app component
├── App.css                 # App styles
├── index.css               # Global styles
└── main.tsx                # Entry point
```

## Usage

1. **Select a Trip**: Use the dropdown at the top to choose a trip from the database
2. **View Overview**: Scroll down to see the trip overview with themes, destinations, and top moments
3. **Browse Days**: Each day shows:
   - Day number and date
   - Narrative summary
   - Highlights, locations, and activities
   - All photos for that day
4. **View Photos**: Each photo displays:
   - The image
   - Capture date and location
   - AI-generated description (subject, setting, mood, activities, etc.)

## API Endpoints Used

- `GET /api/trips` - List all trips
- `GET /api/trips/:tripId` - Get trip details with overview and days
- `GET /api/trips/:tripId/days/:dayNumber` - Get day itinerary with photos
- `GET /uploads/:filename` - Serve uploaded photo files

## Notes

- The frontend expects the backend to serve uploaded photos at `/uploads/:filename`
- Make sure CORS is configured on the backend if running on different ports
- The UI is responsive and works on mobile devices
