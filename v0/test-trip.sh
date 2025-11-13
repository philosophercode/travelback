#!/bin/bash

API_BASE="http://localhost:3000/api/trips"
SAMPLE_TRIP_DIR="./sample_trip"

echo "Step 1: Creating trip..."
TRIP_RESPONSE=$(curl -s -X POST "${API_BASE}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sample Trip Test","startDate":"'$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'"}')

TRIP_ID=$(echo $TRIP_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$TRIP_ID" ]; then
  echo "Failed to create trip: $TRIP_RESPONSE"
  exit 1
fi

echo "✓ Created trip: $TRIP_ID"
echo ""

echo "Step 2: Uploading photos..."
UPLOAD_RESPONSE=$(curl -s -X POST "${API_BASE}/${TRIP_ID}/photos" \
  -F "photos=@${SAMPLE_TRIP_DIR}/DSC07926.jpeg" \
  -F "photos=@${SAMPLE_TRIP_DIR}/DSC07935.jpeg" \
  -F "photos=@${SAMPLE_TRIP_DIR}/DSC08002.jpeg" \
  -F "photos=@${SAMPLE_TRIP_DIR}/DSC08018.jpeg" \
  -F "photos=@${SAMPLE_TRIP_DIR}/DSC08042.jpeg" \
  -F "photos=@${SAMPLE_TRIP_DIR}/IMG_1751.jpeg" \
  -F "photos=@${SAMPLE_TRIP_DIR}/IMG_1770.jpeg")

UPLOAD_COUNT=$(echo $UPLOAD_RESPONSE | grep -o '"uploadedCount":[0-9]*' | cut -d':' -f2)
echo "✓ Uploaded $UPLOAD_COUNT photos"
echo ""

echo "Step 3: Starting processing..."
PROCESS_RESPONSE=$(curl -s -X POST "${API_BASE}/${TRIP_ID}/process")
echo "✓ Processing started"
echo ""

echo "Step 4: Waiting for processing to complete..."
ATTEMPTS=0
MAX_ATTEMPTS=60

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  TRIP_STATUS=$(curl -s "${API_BASE}/${TRIP_ID}")
  STATUS=$(echo $TRIP_STATUS | grep -o '"processingStatus":"[^"]*' | cut -d'"' -f4)
  
  ATTEMPTS=$((ATTEMPTS + 1))
  echo "  Status: $STATUS (attempt $ATTEMPTS/$MAX_ATTEMPTS)"
  
  if [ "$STATUS" = "completed" ]; then
    echo "✓ Processing completed!"
    break
  fi
  
  if [ "$STATUS" = "failed" ]; then
    echo "✗ Processing failed"
    exit 1
  fi
  
  sleep 5
done

if [ "$STATUS" != "completed" ]; then
  echo "✗ Processing timed out"
  exit 1
fi

echo ""
echo "Step 5: Retrieving results..."
echo ""

# Save the full trip data to a JSON file for processing
curl -s "${API_BASE}/${TRIP_ID}" > /tmp/trip_data.json

echo "Results saved to /tmp/trip_data.json"
echo "Use a JSON viewer or run: cat /tmp/trip_data.json | jq"

