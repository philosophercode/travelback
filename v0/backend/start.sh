#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting TravelBack${NC}\n"

# Change to script directory
cd "$(dirname "$0")"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found. Please run ./install.sh first.${NC}"
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed.${NC}"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi

# Check if PostgreSQL container exists (running or stopped)
if docker ps -a --format '{{.Names}}' | grep -q "^travelback-postgres$"; then
    CONTAINER_EXISTS="true"
else
    CONTAINER_EXISTS="false"
fi

if docker ps --format '{{.Names}}' | grep -q "^travelback-postgres$"; then
    CONTAINER_RUNNING="true"
else
    CONTAINER_RUNNING="false"
fi

if [ "$CONTAINER_RUNNING" = "true" ]; then
    echo -e "${GREEN}✅ PostgreSQL container is running${NC}\n"
elif [ "$CONTAINER_EXISTS" = "true" ]; then
    echo -e "${YELLOW}PostgreSQL container exists but is stopped. Starting it...${NC}"
    docker start travelback-postgres
    
    # Wait for PostgreSQL to be ready
    echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
    MAX_RETRIES=30
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if docker exec travelback-postgres pg_isready -U postgres &> /dev/null; then
            echo -e "${GREEN}✅ PostgreSQL is ready${NC}\n"
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep 1
    done
    
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}PostgreSQL container not found. Creating it...${NC}"
    docker-compose up -d postgres
    
    # Wait for PostgreSQL to be ready
    echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
    MAX_RETRIES=30
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if docker exec travelback-postgres pg_isready -U postgres &> /dev/null; then
            echo -e "${GREEN}✅ PostgreSQL is ready${NC}\n"
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep 1
    done
    
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        exit 1
    fi
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}node_modules not found. Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}\n"
fi

# Create uploads directory if it doesn't exist
mkdir -p uploads

# Get port from .env or default to 3000
if [ -f ".env" ]; then
    # Try to read PORT from .env file
    PORT=$(grep -E "^PORT=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" || echo "3000")
    # Remove any whitespace
    PORT=$(echo "$PORT" | xargs)
fi
PORT=${PORT:-3000}

# Check if port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    PID=$(lsof -Pi :$PORT -sTCP:LISTEN -t)
    echo -e "${YELLOW}⚠️  Port $PORT is already in use (PID: $PID)${NC}"
    echo -e "${YELLOW}Would you like to kill the process and continue? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Killing process $PID...${NC}"
        kill -9 $PID 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}✅ Process killed${NC}\n"
    else
        echo -e "${RED}❌ Cannot start server. Port $PORT is in use.${NC}"
        echo -e "${YELLOW}Please stop the process using port $PORT or change the PORT in your .env file.${NC}"
        exit 1
    fi
fi

# Start the application
echo -e "${GREEN}Starting TravelBack API server...${NC}\n"

# Display server URLs
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Server URLs:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${YELLOW}Frontend UI:${NC}     http://localhost:5173"
echo -e "  ${YELLOW}API Base:${NC}        http://localhost:$PORT/api/trips"
echo -e "  ${YELLOW}Health Check:${NC}    http://localhost:$PORT/health"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

npm run dev

