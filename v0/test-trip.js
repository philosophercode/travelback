const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const API_BASE = 'http://localhost:3000/api/trips';
const SAMPLE_TRIP_DIR = path.join(__dirname, '..', 'sample_trip');

// Timing tracking
const timings = {
  upload: {},
  photoProcessing: {},
  dayItineraries: {},
  tripOverview: null,
  total: null
};

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createTrip() {
  const response = await fetch(`${API_BASE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Sample Trip Test',
      startDate: new Date().toISOString()
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create trip: ${error}`);
  }
  
  const data = await response.json();
  return data.data.trip.id;
}

async function uploadPhotos(tripId) {
  const files = fs.readdirSync(SAMPLE_TRIP_DIR)
    .filter(f => f.endsWith('.jpeg') || f.endsWith('.jpg'))
    .map(f => path.join(SAMPLE_TRIP_DIR, f));
  
  console.log(`Uploading ${files.length} photos...`);
  const uploadStart = Date.now();
  
  // Build curl command
  const curlArgs = files.map(file => `-F "photos=@${file}"`).join(' ');
  const curlCmd = `curl -s -X POST "${API_BASE}/${tripId}/photos" ${curlArgs}`;
  
  const responseText = execSync(curlCmd, { encoding: 'utf-8' });
  const data = JSON.parse(responseText);
  
  if (!data.success) {
    throw new Error(`Failed to upload photos: ${JSON.stringify(data)}`);
  }
  
  const uploadDuration = Date.now() - uploadStart;
  timings.upload.total = uploadDuration;
  
  // Track individual photo uploads (approximate, since they're uploaded together)
  data.data.photos.forEach((photo, index) => {
    timings.upload[photo.filename] = uploadDuration / files.length;
  });
  
  console.log(`✓ Uploaded ${data.data.uploadedCount} photos (${formatDuration(uploadDuration)})`);
  return data.data;
}

async function processTrip(tripId) {
  console.log('Starting processing...');
  const response = await fetch(`${API_BASE}/${tripId}/process`, {
    method: 'POST'
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start processing: ${error}`);
  }
  
  const data = await response.json();
  console.log(`✓ ${data.data.message}`);
  return data.data;
}

async function waitForProcessing(tripId) {
  console.log('Waiting for processing to complete...');
  const processingStart = Date.now();
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max (increased for detailed tracking)
  
  // Track photo IDs and their completion times
  const photoIds = new Set();
  const photoCompletionTimes = {};
  const dayCompletionTimes = {};
  let tripOverviewTime = null;
  
  // Get initial photo list by fetching from a day endpoint or directly querying
  // We'll track photos as they appear in day endpoints
  
  while (attempts < maxAttempts) {
    const response = await fetch(`${API_BASE}/${tripId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get trip status: ${await response.text()}`);
    }
    
    const data = await response.json();
    const trip = data.data.trip;
    const days = data.data.days || [];
    
    // Get photos by checking each day, or get all photos from first day if available
    let allPhotos = [];
    if (days.length > 0) {
      // Try to get photos from first day to check status
      try {
        const dayResponse = await fetch(`${API_BASE}/${tripId}/days/${days[0].dayNumber}`);
        if (dayResponse.ok) {
          const dayData = await dayResponse.json();
          allPhotos = dayData.data.photos || [];
        }
      } catch (e) {
        // Day might not have photos yet
      }
    }
    
    // Also try to get photos from all days
    for (const day of days) {
      try {
        const dayResponse = await fetch(`${API_BASE}/${tripId}/days/${day.dayNumber}`);
        if (dayResponse.ok) {
          const dayData = await dayResponse.json();
          (dayData.data.photos || []).forEach(p => {
            if (!allPhotos.find(ap => ap.id === p.id)) {
              allPhotos.push(p);
            }
          });
        }
      } catch (e) {
        // Day might not be ready yet
      }
    }
    
    allPhotos.forEach(photo => {
      if (!photoIds.has(photo.id)) {
        photoIds.add(photo.id);
      }
      
      // Track when photo completes
      if (photo.processingStatus === 'completed' && !photoCompletionTimes[photo.id]) {
        photoCompletionTimes[photo.id] = {
          filename: photo.filename,
          completedAt: Date.now(),
          duration: Date.now() - processingStart
        };
      }
    });
    
    // Track when day itineraries are created
    days.forEach(day => {
      if (!dayCompletionTimes[day.dayNumber]) {
        dayCompletionTimes[day.dayNumber] = {
          dayNumber: day.dayNumber,
          completedAt: Date.now(),
          duration: Date.now() - processingStart
        };
      }
    });
    
    // Track when trip overview is created
    if (trip.overview && !tripOverviewTime) {
      tripOverviewTime = Date.now() - processingStart;
    }
    
    const completedPhotos = Object.keys(photoCompletionTimes).length;
    const completedDays = Object.keys(dayCompletionTimes).length;
    const statusMsg = `  Status: ${trip.processingStatus} | Photos: ${completedPhotos}/${photoIds.size} | Days: ${completedDays}/${days.length} (attempt ${attempts + 1}/${maxAttempts})`;
    console.log(statusMsg);
    
    if (trip.processingStatus === 'completed') {
      const totalDuration = Date.now() - processingStart;
      timings.total = totalDuration;
      timings.tripOverview = tripOverviewTime;
      
      // Store photo processing times
      Object.values(photoCompletionTimes).forEach(({ filename, duration }) => {
        timings.photoProcessing[filename] = duration;
      });
      
      // Store day processing times
      Object.values(dayCompletionTimes).forEach(({ dayNumber, duration }) => {
        timings.dayItineraries[dayNumber] = duration;
      });
      
      console.log(`✓ Processing completed! (Total: ${formatDuration(totalDuration)})`);
      return data.data;
    }
    
    if (trip.processingStatus === 'failed') {
      throw new Error('Processing failed');
    }
    
    await sleep(2000); // Check every 2 seconds for more granular tracking
    attempts++;
  }
  
  throw new Error('Processing timed out');
}

async function getTripDetails(tripId) {
  const response = await fetch(`${API_BASE}/${tripId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get trip details: ${await response.text()}`);
  }
  
  return await response.json();
}

async function getDayDetails(tripId, dayNumber) {
  const response = await fetch(`${API_BASE}/${tripId}/days/${dayNumber}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get day details: ${await response.text()}`);
  }
  
  return await response.json();
}

function formatPhotoDescription(photo) {
  if (!photo.description) {
    return 'No description available';
  }
  
  const desc = photo.description;
  return `    Main Subject: ${desc.mainSubject}
    Setting: ${desc.setting}
    Activities: ${desc.activities.join(', ')}
    Mood: ${desc.mood}
    Time of Day: ${desc.timeOfDay}
    Weather: ${desc.weather}
    Notable Details: ${desc.notableDetails.join(', ')}
    Visual Quality: ${desc.visualQuality}`;
}

function formatDaySummary(day) {
  if (!day.summary) {
    return 'No summary available';
  }
  
  const summary = day.summary;
  return `    Title: ${summary.title}
    Narrative: ${summary.narrative}
    Highlights: ${summary.highlights.join(', ')}
    Locations: ${summary.locations.join(', ')}
    Activities: ${summary.activities.join(', ')}
    Start Time: ${summary.startTime}
    End Time: ${summary.endTime}
    Total Distance: ${summary.totalDistance} km`;
}

function formatTripOverview(overview) {
  if (!overview) {
    return 'No overview available';
  }
  
  return `    Title: ${overview.title}
    Summary: ${overview.summary}
    Destinations: ${overview.destinations.map(d => `${d.name} (Days: ${d.days.join(', ')})`).join('; ')}
    Themes: ${overview.themes.join(', ')}
    Total Days: ${overview.totalDays}
    Total Photos: ${overview.totalPhotos}
    Top Moments: ${overview.topMoments.join(', ')}
    Travel Style: ${overview.travelStyle || 'N/A'}`;
}

function displayTimings() {
  console.log('\n' + '='.repeat(80));
  console.log('PROCESSING TIMINGS');
  console.log('='.repeat(80));
  
  // Upload timings
  console.log('\n📤 UPLOAD TIMINGS');
  console.log('-'.repeat(80));
  if (timings.upload.total) {
    console.log(`Total Upload Time: ${formatDuration(timings.upload.total)}`);
    Object.entries(timings.upload).forEach(([filename, duration]) => {
      if (filename !== 'total') {
        console.log(`  ${filename}: ${formatDuration(duration)}`);
      }
    });
  }
  
  // Photo processing timings
  console.log('\n🖼️  PHOTO PROCESSING TIMINGS');
  console.log('-'.repeat(80));
  const photoEntries = Object.entries(timings.photoProcessing)
    .sort((a, b) => a[1] - b[1]); // Sort by duration
  photoEntries.forEach(([filename, duration]) => {
    console.log(`  ${filename}: ${formatDuration(duration)}`);
  });
  if (photoEntries.length > 0) {
    const avgPhotoTime = photoEntries.reduce((sum, [, d]) => sum + d, 0) / photoEntries.length;
    const minPhotoTime = Math.min(...photoEntries.map(([, d]) => d));
    const maxPhotoTime = Math.max(...photoEntries.map(([, d]) => d));
    console.log(`  Average: ${formatDuration(avgPhotoTime)} | Min: ${formatDuration(minPhotoTime)} | Max: ${formatDuration(maxPhotoTime)}`);
  }
  
  // Day itinerary timings
  console.log('\n📅 DAY ITINERARY GENERATION TIMINGS');
  console.log('-'.repeat(80));
  const dayEntries = Object.entries(timings.dayItineraries)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0])); // Sort by day number
  dayEntries.forEach(([dayNumber, duration]) => {
    console.log(`  Day ${dayNumber}: ${formatDuration(duration)}`);
  });
  
  // Trip overview timing
  console.log('\n🌍 TRIP OVERVIEW GENERATION TIMING');
  console.log('-'.repeat(80));
  if (timings.tripOverview !== null) {
    console.log(`  Trip Overview: ${formatDuration(timings.tripOverview)}`);
  }
  
  // Total timing
  console.log('\n⏱️  TOTAL PROCESSING TIME');
  console.log('-'.repeat(80));
  if (timings.total !== null) {
    console.log(`  Total: ${formatDuration(timings.total)}`);
  }
  
  console.log('');
}

async function main() {
  const overallStart = Date.now();
  
  try {
    // Step 1: Create trip
    console.log('Step 1: Creating trip...');
    const tripId = await createTrip();
    console.log(`✓ Created trip: ${tripId}\n`);
    
    // Step 2: Upload photos
    console.log('Step 2: Uploading photos...');
    await uploadPhotos(tripId);
    console.log('');
    
    // Step 3: Start processing
    console.log('Step 3: Starting processing...');
    await processTrip(tripId);
    console.log('');
    
    // Step 4: Wait for processing (with detailed timing)
    const tripData = await waitForProcessing(tripId);
    console.log('');
    
    // Display timings
    displayTimings();
    
    // Step 5: Get all details
    console.log('Step 5: Retrieving results...\n');
    const details = await getTripDetails(tripId);
    const trip = details.data.trip;
    const days = details.data.days;
    
    // Get all photos with day details
    const allPhotos = [];
    for (const day of days) {
      const dayData = await getDayDetails(tripId, day.dayNumber);
      allPhotos.push(...dayData.data.photos);
    }
    
    // Display results
    console.log('='.repeat(80));
    console.log('TRIP OVERVIEW');
    console.log('='.repeat(80));
    console.log(formatTripOverview(trip.overview));
    console.log('\n');
    
    // Display day descriptions
    console.log('='.repeat(80));
    console.log('DAY DESCRIPTIONS');
    console.log('='.repeat(80));
    for (const day of days) {
      console.log(`\nDay ${day.dayNumber} (${new Date(day.date).toLocaleDateString()})`);
      console.log('-'.repeat(80));
      console.log(formatDaySummary(day));
      console.log('');
    }
    
    // Display photo descriptions
    console.log('='.repeat(80));
    console.log('PHOTO DESCRIPTIONS');
    console.log('='.repeat(80));
    for (const photo of allPhotos) {
      console.log(`\n${photo.filename}`);
      console.log(`Day: ${photo.dayNumber || 'N/A'} | Captured: ${photo.capturedAt ? new Date(photo.capturedAt).toLocaleString() : 'N/A'}`);
      console.log(`Location: ${photo.locationCity || 'Unknown'}, ${photo.locationCountry || 'Unknown'}`);
      if (timings.photoProcessing[photo.filename]) {
        console.log(`Processing Time: ${formatDuration(timings.photoProcessing[photo.filename])}`);
      }
      console.log('-'.repeat(80));
      console.log(formatPhotoDescription(photo));
      console.log('');
    }
    
    // Display full JSON descriptions
    console.log('='.repeat(80));
    console.log('FULL PHOTO DESCRIPTIONS (JSON)');
    console.log('='.repeat(80));
    for (const photo of allPhotos) {
      console.log(`\n${photo.filename}:`);
      console.log(JSON.stringify(photo.description, null, 2));
      console.log('');
    }
    
    // Display full day summaries
    console.log('='.repeat(80));
    console.log('FULL DAY SUMMARIES (JSON)');
    console.log('='.repeat(80));
    for (const day of days) {
      console.log(`\nDay ${day.dayNumber} (${new Date(day.date).toLocaleDateString()}):`);
      console.log(JSON.stringify(day.summary, null, 2));
      console.log('');
    }
    
    // Display full trip overview
    console.log('='.repeat(80));
    console.log('FULL TRIP OVERVIEW (JSON)');
    console.log('='.repeat(80));
    console.log(JSON.stringify(trip.overview, null, 2));
    console.log('');
    
    const overallDuration = Date.now() - overallStart;
    console.log(`\n⏱️  Total Test Duration: ${formatDuration(overallDuration)}\n`);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
