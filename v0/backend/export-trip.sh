#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

TRIP_ID="${1}"
OUTPUT_DIR="${2:-./test/fixtures}"

if [ -z "$TRIP_ID" ]; then
  echo -e "${RED}Usage: $0 <trip-id> [output-dir]${NC}"
  echo "Example: $0 dc681854-cc27-4ea0-be60-11daddb04ff5 ./test/fixtures"
  exit 1
fi

API_URL="${API_URL:-http://localhost:3000}"

echo -e "${BLUE}📦 Exporting trip data from database...${NC}\n"
echo "Trip ID: $TRIP_ID"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Fetch trip details
echo -e "${YELLOW}Fetching trip details...${NC}"
TRIP_RESPONSE=$(curl -s -X GET "${API_URL}/api/trips/${TRIP_ID}")

if echo "$TRIP_RESPONSE" | grep -q '"success":false'; then
  echo -e "${RED}❌ Failed to fetch trip${NC}"
  echo "$TRIP_RESPONSE" | jq '.' 2>/dev/null || echo "$TRIP_RESPONSE"
  exit 1
fi

# Save trip data
TRIP_FILE="${OUTPUT_DIR}/trip-${TRIP_ID}.json"
echo "$TRIP_RESPONSE" | jq '.' > "$TRIP_FILE"
echo -e "${GREEN}✅ Saved trip data to ${TRIP_FILE}${NC}"

# Get number of days
DAYS=$(echo "$TRIP_RESPONSE" | jq -r '.data.days | length' 2>/dev/null || echo "0")
echo "Found $DAYS day(s)"

# Fetch each day's itinerary
if [ "$DAYS" -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}Fetching day itineraries...${NC}"
  
  DAYS_DIR="${OUTPUT_DIR}/days"
  mkdir -p "$DAYS_DIR"
  
  for i in $(seq 1 $DAYS); do
    DAY_RESPONSE=$(curl -s -X GET "${API_URL}/api/trips/${TRIP_ID}/days/${i}")
    DAY_FILE="${DAYS_DIR}/day-${i}.json"
    echo "$DAY_RESPONSE" | jq '.' > "$DAY_FILE"
    echo -e "${GREEN}✅ Saved day ${i} to ${DAY_FILE}${NC}"
  done
fi

# Create a combined fixture file
echo ""
echo -e "${YELLOW}Creating combined fixture file...${NC}"

COMBINED_FILE="${OUTPUT_DIR}/trip-${TRIP_ID}-complete.json"

# Build combined JSON
cat > "$COMBINED_FILE" << EOF
{
  "trip": $(cat "$TRIP_FILE" | jq '.data.trip'),
  "photos": $(cat "$TRIP_FILE" | jq '.data.trip.photos // []'),
  "days": [
EOF

if [ "$DAYS" -gt 0 ]; then
  for i in $(seq 1 $DAYS); do
    DAY_FILE="${DAYS_DIR}/day-${i}.json"
    if [ $i -gt 1 ]; then
      echo "," >> "$COMBINED_FILE"
    fi
    cat "$DAY_FILE" | jq '.data' >> "$COMBINED_FILE"
  done
fi

cat >> "$COMBINED_FILE" << EOF
  ],
  "overview": $(cat "$TRIP_FILE" | jq '.data.trip.overview'),
  "metadata": {
    "exportedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "tripId": "$TRIP_ID",
    "totalPhotos": $(cat "$TRIP_FILE" | jq '.data.totalPhotos // 0'),
    "totalDays": $DAYS
  }
}
EOF

# Format the combined file
TEMP_FILE=$(mktemp)
jq '.' "$COMBINED_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$COMBINED_FILE"

echo -e "${GREEN}✅ Saved combined fixture to ${COMBINED_FILE}${NC}"

# Show summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ Export Complete ✨${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

TRIP_NAME=$(cat "$TRIP_FILE" | jq -r '.data.name // "Unknown"')
TRIP_STATUS=$(cat "$TRIP_FILE" | jq -r '.data.processing_status // "unknown"')
PHOTO_COUNT=$(cat "$TRIP_FILE" | jq -r '.data.photos | length // 0')

echo -e "Trip: ${TRIP_NAME}"
echo -e "Status: ${TRIP_STATUS}"
echo -e "Photos: ${PHOTO_COUNT}"
echo -e "Days: ${DAYS}"
echo ""
echo -e "Files created:"
echo -e "  • ${TRIP_FILE}"
if [ "$DAYS" -gt 0 ]; then
  echo -e "  • ${DAYS_DIR}/day-*.json (${DAYS} files)"
fi
echo -e "  • ${COMBINED_FILE} (recommended for tests)"
echo ""
echo -e "${BLUE}💡 Use the combined fixture in your tests:${NC}"
echo -e "   const fixture = require('./fixtures/trip-${TRIP_ID}-complete.json');"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

