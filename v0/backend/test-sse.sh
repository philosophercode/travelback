#!/bin/bash

# Simple example: Using curl with SSE to monitor trip processing status
# Usage: ./test-sse.sh <trip-id>

set -e

API_URL="${API_URL:-http://localhost:3000}"
TRIP_ID="${1}"

if [ -z "$TRIP_ID" ]; then
  echo "Usage: $0 <trip-id>"
  echo "Example: $0 123e4567-e89b-12d3-a456-426614174000"
  exit 1
fi

echo "Connecting to SSE stream for trip: $TRIP_ID"
echo "Press Ctrl+C to disconnect"
echo ""

# Simple curl command for SSE
# -N or --no-buffer: Disable buffering (required for streaming)
# -s: Silent mode (suppress progress bar)
# Without -N, curl will buffer the entire response before showing it

curl -N -s "${API_URL}/api/trips/${TRIP_ID}/status"

# Alternative: With verbose output to see raw SSE format
# curl -N -v "${API_URL}/api/trips/${TRIP_ID}/status" 2>&1 | grep -E "(event:|data:)"

# Alternative: Parse and format events nicely
# curl -N -s "${API_URL}/api/trips/${TRIP_ID}/status" | while IFS= read -r line; do
#   if [[ "$line" =~ ^event:[[:space:]]*(.+)$ ]]; then
#     echo "Event: ${BASH_REMATCH[1]}"
#   elif [[ "$line" =~ ^data:[[:space:]]*(.+)$ ]]; then
#     echo "Data: ${BASH_REMATCH[1]}" | jq '.' 2>/dev/null || echo "Data: ${BASH_REMATCH[1]}"
#   fi
# done

