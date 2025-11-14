#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3000}"
SAMPLE_TRIP_DIR="${SAMPLE_TRIP_DIR:-../../sample_trip}"

echo -e "${BLUE}🚀 TravelBack Photo Upload & Processing Test${NC}\n"

# Step 1: Create a trip
echo -e "${YELLOW}Step 1: Creating trip...${NC}"
CREATE_RESPONSE=$(curl -s -X POST "${API_URL}/api/trips" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Trip", "startDate": "2024-01-01"}')

TRIP_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$TRIP_ID" ]; then
  echo -e "${RED}❌ Failed to create trip${NC}"
  echo "$CREATE_RESPONSE" | jq '.' 2>/dev/null || echo "$CREATE_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Trip created: ${TRIP_ID}${NC}\n"
echo "$CREATE_RESPONSE" | jq '.' 2>/dev/null || echo "$CREATE_RESPONSE"
echo ""

# Step 2: Upload 5 photos
echo -e "${YELLOW}Step 2: Uploading 5 photos...${NC}"

# Get first 5 photos (prioritize IMG files with GPS)
ALL_FILES=$(ls -1 "${SAMPLE_TRIP_DIR}"/*.jpeg 2>/dev/null | head -14)
IMG_FILES=$(echo "$ALL_FILES" | grep -i "IMG_" | head -3)
OTHER_FILES=$(echo "$ALL_FILES" | grep -v -i "IMG_" | head -2)
FILES=$(echo -e "$IMG_FILES\n$OTHER_FILES" | head -5)

if [ -z "$FILES" ]; then
  echo -e "${RED}❌ No photos found in ${SAMPLE_TRIP_DIR}${NC}"
  exit 1
fi

echo "Uploading: $(echo "$FILES" | xargs -n1 basename | tr '\n' ' ')"
echo ""

# Build curl command with multiple file attachments
CURL_CMD="curl -s -X POST \"${API_URL}/api/trips/${TRIP_ID}/photos\""
for file in $FILES; do
  CURL_CMD="${CURL_CMD} -F \"photos=@${file}\""
done

UPLOAD_RESPONSE=$(eval "$CURL_CMD")

echo "$UPLOAD_RESPONSE" | jq '.' 2>/dev/null || echo "$UPLOAD_RESPONSE"
echo ""

UPLOADED_COUNT=$(echo "$UPLOAD_RESPONSE" | grep -o '"uploadedCount":[0-9]*' | cut -d':' -f2)

if [ -z "$UPLOADED_COUNT" ] || [ "$UPLOADED_COUNT" -eq 0 ]; then
  echo -e "${RED}❌ Failed to upload photos${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Uploaded ${UPLOADED_COUNT} photos${NC}\n"

# Step 3: Trigger processing
echo -e "${YELLOW}Step 3: Triggering AI processing...${NC}"
PROCESS_RESPONSE=$(curl -s -X POST "${API_URL}/api/trips/${TRIP_ID}/process" \
  -H "Content-Type: application/json")

echo "$PROCESS_RESPONSE" | jq '.' 2>/dev/null || echo "$PROCESS_RESPONSE"
echo ""

echo -e "${GREEN}✅ Processing started${NC}\n"

# Step 4: Monitor processing via SSE (Server-Sent Events)
echo -e "${YELLOW}Step 4: Monitoring processing status via SSE...${NC}"
echo "Connecting to status stream (processing typically takes ~95 seconds for 5 photos)..."
echo ""

# Use curl with SSE to stream status updates
PROCESSING_COMPLETE=false

# Function to parse SSE events
parse_sse_event() {
  local line="$1"
  if [[ "$line" =~ ^event:[[:space:]]*(.+)$ ]]; then
    EVENT_TYPE="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ ^data:[[:space:]]*(.+)$ ]]; then
    EVENT_DATA="${BASH_REMATCH[1]}"
    # Process the event
    if [ -n "$EVENT_TYPE" ] && [ -n "$EVENT_DATA" ]; then
      case "$EVENT_TYPE" in
        "status")
          STATUS=$(echo "$EVENT_DATA" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
          MESSAGE=$(echo "$EVENT_DATA" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
          echo -e "${BLUE}📊 Status: ${STATUS}${NC}"
          if [ -n "$MESSAGE" ]; then
            echo -e "   ${MESSAGE}"
          fi
          if [ "$STATUS" = "completed" ]; then
            echo -e "${GREEN}✅ Processing completed!${NC}\n"
            PROCESSING_COMPLETE=true
          elif [ "$STATUS" = "failed" ]; then
            echo -e "${RED}⚠️  Processing failed${NC}\n"
            PROCESSING_COMPLETE=true
          fi
          ;;
        "progress")
          STEP=$(echo "$EVENT_DATA" | grep -o '"step":"[^"]*"' | cut -d'"' -f4)
          COMPLETED=$(echo "$EVENT_DATA" | grep -o '"completed":[0-9]*' | cut -d':' -f2)
          TOTAL=$(echo "$EVENT_DATA" | grep -o '"total":[0-9]*' | cut -d':' -f2)
          MESSAGE=$(echo "$EVENT_DATA" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
          if [ -n "$STEP" ]; then
            echo -e "${BLUE}📈 Progress: ${STEP}${NC}"
            if [ -n "$COMPLETED" ] && [ -n "$TOTAL" ]; then
              echo -e "   ${COMPLETED}/${TOTAL} completed"
            fi
            if [ -n "$MESSAGE" ]; then
              echo -e "   ${MESSAGE}"
            fi
          fi
          ;;
        "connected")
          echo -e "${GREEN}🔌 Connected to status stream${NC}"
          ;;
        "summary")
          # Parse and display trip summary with jq for better formatting
          OVERVIEW_TITLE=$(echo "$EVENT_DATA" | jq -r '.overview.title // empty' 2>/dev/null)
          OVERVIEW_NARRATIVE=$(echo "$EVENT_DATA" | jq -r '.overview.narrative // empty' 2>/dev/null)
          TRIP_NAME=$(echo "$EVENT_DATA" | jq -r '.name // empty' 2>/dev/null)
          START_DATE=$(echo "$EVENT_DATA" | jq -r '.startDate // empty' 2>/dev/null | cut -d'T' -f1)
          END_DATE=$(echo "$EVENT_DATA" | jq -r '.endDate // empty' 2>/dev/null | cut -d'T' -f1)
          TOTAL_PHOTOS=$(echo "$EVENT_DATA" | jq -r '.totalPhotos // 0' 2>/dev/null)
          TOTAL_DAYS=$(echo "$EVENT_DATA" | jq -r '.totalDays // 0' 2>/dev/null)
          
          echo ""
          echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
          echo -e "${GREEN}✨ Trip Overview ✨${NC}"
          echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
          
          if [ -n "$OVERVIEW_TITLE" ] && [ "$OVERVIEW_TITLE" != "null" ]; then
            echo -e "${YELLOW}📖 ${OVERVIEW_TITLE}${NC}\n"
          fi
          
          if [ -n "$OVERVIEW_NARRATIVE" ] && [ "$OVERVIEW_NARRATIVE" != "null" ]; then
            # Word wrap the narrative at 80 characters
            echo "$OVERVIEW_NARRATIVE" | fold -s -w 80
            echo ""
          fi
          
          echo -e "${BLUE}📊 Trip Details:${NC}"
          if [ -n "$TRIP_NAME" ]; then
            echo -e "  • Name: ${TRIP_NAME}"
          fi
          if [ -n "$START_DATE" ] && [ "$START_DATE" != "null" ]; then
            echo -e "  • Dates: ${START_DATE} → ${END_DATE}"
          fi
          if [ -n "$TOTAL_PHOTOS" ]; then
            echo -e "  • Photos: ${TOTAL_PHOTOS}"
          fi
          if [ -n "$TOTAL_DAYS" ]; then
            echo -e "  • Days: ${TOTAL_DAYS}"
          fi
          
          # Show day titles if available
          DAY_TITLES=$(echo "$EVENT_DATA" | jq -r '.days[]? | "\(.dayNumber). \(.title)"' 2>/dev/null)
          if [ -n "$DAY_TITLES" ]; then
            echo ""
            echo -e "${BLUE}📅 Daily Itineraries:${NC}"
            echo "$DAY_TITLES" | while read -r day; do
              echo -e "  • Day $day"
            done
          fi
          
          echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
          echo ""
          ;;
      esac
      EVENT_TYPE=""
      EVENT_DATA=""
    fi
  fi
}

# Connect to SSE stream and parse events
EVENT_TYPE=""
EVENT_DATA=""

# Start SSE connection and parse output
curl -N -s "${API_URL}/api/trips/${TRIP_ID}/status" | while IFS= read -r line; do
  parse_sse_event "$line"
  
  # Check if processing is complete
  if [ "$PROCESSING_COMPLETE" = true ]; then
    break
  fi
done

# Wait for final database writes to complete
echo -e "${BLUE}⏳ Waiting for final data to be written...${NC}"
sleep 3

# Step 5: Show final results
echo -e "${YELLOW}Step 5: Final trip details...${NC}\n"
TRIP_RESPONSE=$(curl -s -X GET "${API_URL}/api/trips/${TRIP_ID}")
echo "$TRIP_RESPONSE" | jq '.' 2>/dev/null || echo "$TRIP_RESPONSE"
echo ""

# Step 6: Show day itineraries if available
echo -e "${YELLOW}Step 6: Day itineraries...${NC}\n"
DAYS=$(echo "$TRIP_RESPONSE" | jq -r '.data.days | length' 2>/dev/null || echo "0")

if [ "$DAYS" -gt 0 ]; then
  echo -e "${GREEN}✅ Found ${DAYS} day(s) of itineraries${NC}\n"
  for i in $(seq 1 $DAYS); do
    DAY_RESPONSE=$(curl -s -X GET "${API_URL}/api/trips/${TRIP_ID}/days/${i}")
    echo -e "${BLUE}━━━ Day ${i} ━━━${NC}"
    echo "$DAY_RESPONSE" | jq '.' 2>/dev/null || echo "$DAY_RESPONSE"
    echo ""
  done
else
  echo -e "${YELLOW}⚠️  No day itineraries found. Processing may still be in progress.${NC}"
  echo -e "   Check trip status: ${API_URL}/api/trips/${TRIP_ID}"
fi

echo -e "${GREEN}✨ Test complete!${NC}"
echo -e "Trip ID: ${TRIP_ID}"
echo -e "View trip: ${API_URL}/api/trips/${TRIP_ID}"

