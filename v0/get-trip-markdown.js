const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getLatestTrip() {
  // Get the most recent completed trip, or fall back to most recent
  const result = await pool.query(
    `SELECT id, name, overview, processing_status, start_date, end_date
     FROM trips
     WHERE processing_status = 'completed'
     ORDER BY created_at DESC
     LIMIT 1`
  );
  
  if (result.rows.length === 0) {
    // Fall back to most recent trip if no completed trip
    const fallback = await pool.query(
      `SELECT id, name, overview, processing_status, start_date, end_date
       FROM trips
       ORDER BY created_at DESC
       LIMIT 1`
    );
    return fallback.rows[0];
  }
  
  return result.rows[0];
}

async function getTripDays(tripId) {
  const result = await pool.query(
    `SELECT day_number, date, summary
     FROM day_itineraries
     WHERE trip_id = $1
     ORDER BY day_number ASC`,
    [tripId]
  );
  return result.rows;
}

async function getTripPhotos(tripId) {
  const result = await pool.query(
    `SELECT id, filename, captured_at, day_number, description,
            location_city, location_country, location_landmark,
            processing_status
     FROM photos
     WHERE trip_id = $1
     ORDER BY captured_at ASC`,
    [tripId]
  );
  return result.rows;
}

function formatPhotoDescription(photo) {
  if (!photo.description) {
    return 'No description available';
  }
  
  const desc = photo.description;
  return `**Main Subject:** ${desc.mainSubject || 'N/A'}
**Setting:** ${desc.setting || 'N/A'}
**Activities:** ${desc.activities?.join(', ') || 'N/A'}
**Mood:** ${desc.mood || 'N/A'}
**Time of Day:** ${desc.timeOfDay || 'N/A'}
**Weather:** ${desc.weather || 'N/A'}
**Notable Details:** ${desc.notableDetails?.join(', ') || 'N/A'}
**Visual Quality:** ${desc.visualQuality || 'N/A'}`;
}

function formatDaySummary(day) {
  if (!day.summary) {
    return 'No summary available';
  }
  
  const summary = day.summary;
  return `## ${summary.title || `Day ${day.day_number}`}

**Narrative:**
${summary.narrative || 'N/A'}

**Highlights:**
${summary.highlights?.map(h => `- ${h}`).join('\n') || 'N/A'}

**Locations:**
${summary.locations?.map(l => `- ${l}`).join('\n') || 'N/A'}

**Activities:**
${summary.activities?.map(a => `- ${a}`).join('\n') || 'N/A'}

**Time:** ${summary.startTime || 'N/A'} - ${summary.endTime || 'N/A'}

**Total Distance:** ${summary.totalDistance || 'N/A'} km`;
}

function formatTripOverview(overview) {
  if (!overview) {
    return 'No overview available';
  }
  
  return `# ${overview.title || 'Trip Overview'}

## Summary

${overview.summary || 'N/A'}

## Destinations

${overview.destinations?.map(d => 
  `### ${d.name}
- **Days:** ${d.days?.join(', ')}
- **Highlights:** ${d.highlights?.join(', ')}`
).join('\n\n') || 'N/A'}

## Themes

${overview.themes?.map(t => `- ${t}`).join('\n') || 'N/A'}

## Top Moments

${overview.topMoments?.map(m => `- ${m}`).join('\n') || 'N/A'}

**Travel Style:** ${overview.travelStyle || 'N/A'}

**Total Days:** ${overview.totalDays || 'N/A'}  
**Total Photos:** ${overview.totalPhotos || 'N/A'}`;
}

async function main() {
  try {
    console.log('Fetching latest trip from database...\n');
    
    const trip = await getLatestTrip();
    if (!trip) {
      console.log('No trips found in database.');
      process.exit(0);
    }
    
    console.log(`# Trip: ${trip.name}\n`);
    console.log(`**Status:** ${trip.processing_status}`);
    console.log(`**Trip ID:** ${trip.id}`);
    if (trip.start_date) {
      console.log(`**Dates:** ${new Date(trip.start_date).toLocaleDateString()} - ${trip.end_date ? new Date(trip.end_date).toLocaleDateString() : 'N/A'}`);
    }
    console.log('\n---\n');
    
    // Get trip overview
    if (trip.overview) {
      console.log(formatTripOverview(trip.overview));
      console.log('\n---\n');
    }
    
    // Get day itineraries
    const days = await getTripDays(trip.id);
    if (days.length > 0) {
      console.log('# Day Itineraries\n');
      for (const day of days) {
        console.log(formatDaySummary(day));
        console.log('\n---\n');
      }
    }
    
    // Get photos
    const photos = await getTripPhotos(trip.id);
    if (photos.length > 0) {
      console.log('# Photo Descriptions\n');
      
      // Group photos by day
      const photosByDay = {};
      photos.forEach(photo => {
        const dayNum = photo.day_number || 0;
        if (!photosByDay[dayNum]) {
          photosByDay[dayNum] = [];
        }
        photosByDay[dayNum].push(photo);
      });
      
      // Sort days
      const sortedDays = Object.keys(photosByDay).sort((a, b) => parseInt(a) - parseInt(b));
      
      for (const dayNum of sortedDays) {
        const dayPhotos = photosByDay[dayNum];
        if (dayNum !== '0') {
          console.log(`## Day ${dayNum}\n`);
        } else {
          console.log(`## Photos (No Day Assigned)\n`);
        }
        
        for (const photo of dayPhotos) {
          const location = photo.location_landmark 
            ? `${photo.location_landmark}, ${photo.location_city || ''}, ${photo.location_country || ''}`.trim()
            : photo.location_city 
              ? `${photo.location_city}, ${photo.location_country || ''}`.trim()
              : 'Unknown location';
          
          console.log(`### ${photo.filename}`);
          console.log(`**Captured:** ${photo.captured_at ? new Date(photo.captured_at).toLocaleString() : 'N/A'}`);
          console.log(`**Location:** ${location}`);
          console.log(`**Status:** ${photo.processing_status}`);
          console.log('');
          console.log(formatPhotoDescription(photo));
          console.log('\n---\n');
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

