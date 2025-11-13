const API_BASE = 'http://localhost:3000/api/trips';

// Get the most recent trip ID from the last test
// You can also pass trip ID as command line argument
const tripId = process.argv[2] || '97b01eb9-7b81-4fb9-9251-4a67f12a75e5';

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

async function main() {
  try {
    console.log(`Fetching descriptions for trip: ${tripId}\n`);
    
    const details = await getTripDetails(tripId);
    const trip = details.data.trip;
    const days = details.data.days;
    
    // Get all photos with day details
    const allPhotos = [];
    for (const day of days) {
      const dayData = await getDayDetails(tripId, day.dayNumber);
      allPhotos.push(...dayData.data.photos);
    }
    
    // Display full JSON descriptions
    console.log('='.repeat(80));
    console.log('FULL PHOTO DESCRIPTIONS (JSON)');
    console.log('='.repeat(80));
    for (const photo of allPhotos.sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0) || a.filename.localeCompare(b.filename))) {
      console.log(`\n${photo.filename} (Day ${photo.dayNumber || 'N/A'}):`);
      console.log(JSON.stringify(photo.description, null, 2));
      console.log('');
    }
    
    // Display full day summaries
    console.log('='.repeat(80));
    console.log('FULL DAY SUMMARIES (JSON)');
    console.log('='.repeat(80));
    for (const day of days.sort((a, b) => a.dayNumber - b.dayNumber)) {
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
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

