#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    
    # Kill background processes
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    
    # Wait for processes to exit
    wait $BACKEND_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     TravelBack Startup Script        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Check Node.js
echo -e "${CYAN}Checking prerequisites...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 20+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}❌ Node.js version 20+ is required. Current version: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed.${NC}"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"

# Check curl (needed for health checks)
if ! command -v curl &> /dev/null; then
    echo -e "${RED}❌ curl is not installed. Please install curl.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ curl is available${NC}\n"

# Step 1: Start Database
echo -e "${CYAN}📦 Starting PostgreSQL database...${NC}"
cd "$BACKEND_DIR"

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
    echo -e "${GREEN}✅ PostgreSQL container is already running${NC}"
elif [ "$CONTAINER_EXISTS" = "true" ]; then
    echo -e "${YELLOW}PostgreSQL container exists but is stopped. Starting it...${NC}"
    docker start travelback-postgres
else
    echo -e "${YELLOW}Creating PostgreSQL container...${NC}"
    docker-compose up -d postgres
fi

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
    echo -e "${RED}❌ PostgreSQL failed to start after ${MAX_RETRIES} seconds${NC}"
    exit 1
fi

# Check backend .env file
if [ ! -f "${BACKEND_DIR}/.env" ]; then
    echo -e "${RED}❌ Backend .env file not found at ${BACKEND_DIR}/.env${NC}"
    echo -e "${YELLOW}Please run: cd backend && ./install.sh${NC}"
    exit 1
fi

# Check backend node_modules
if [ ! -d "${BACKEND_DIR}/node_modules" ]; then
    echo -e "${YELLOW}Backend dependencies not found. Installing...${NC}"
    cd "$BACKEND_DIR"
    npm install
    echo -e "${GREEN}✅ Backend dependencies installed${NC}\n"
fi

# Check frontend node_modules
if [ ! -d "${FRONTEND_DIR}/node_modules" ]; then
    echo -e "${YELLOW}Frontend dependencies not found. Installing...${NC}"
    cd "$FRONTEND_DIR"
    npm install
    echo -e "${GREEN}✅ Frontend dependencies installed${NC}\n"
fi

# Create uploads directory if it doesn't exist
mkdir -p "${BACKEND_DIR}/uploads"

# Check if backend is already running
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Backend is already running on http://localhost:3000${NC}"
    echo -e "${YELLOW}   Skipping backend startup. Use existing instance.${NC}\n"
    BACKEND_PID=""
    BACKEND_READY=true
else
    # Step 2: Start Backend
    echo -e "${CYAN}🚀 Starting backend server...${NC}"
    cd "$BACKEND_DIR"
    npm run dev > /tmp/travelback-backend.log 2>&1 &
    BACKEND_PID=$!

    # Wait for backend to start
    echo -e "${YELLOW}Waiting for backend to start...${NC}"
    MAX_RETRIES=30
    RETRY_COUNT=0
    BACKEND_READY=false

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s http://localhost:3000/health > /dev/null 2>&1; then
            BACKEND_READY=true
            break
        fi
        
        # Check if process is still running
        if ! kill -0 $BACKEND_PID 2>/dev/null; then
            echo -e "${RED}❌ Backend process died. Check logs:${NC}"
            tail -20 /tmp/travelback-backend.log
            exit 1
        fi
        
        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep 1
    done

    if [ "$BACKEND_READY" = "false" ]; then
        echo -e "${RED}❌ Backend failed to start after ${MAX_RETRIES} seconds${NC}"
        echo -e "${YELLOW}Backend logs:${NC}"
        tail -20 /tmp/travelback-backend.log
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi

    echo -e "${GREEN}✅ Backend is running on http://localhost:3000${NC}\n"
fi

# Check if frontend is already running
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Frontend is already running on http://localhost:5173${NC}"
    echo -e "${YELLOW}   Skipping frontend startup. Use existing instance.${NC}\n"
    FRONTEND_PID=""
    FRONTEND_READY=true
else
    # Step 3: Start Frontend
    echo -e "${CYAN}🎨 Starting frontend server...${NC}"
    cd "$FRONTEND_DIR"
    npm run dev > /tmp/travelback-frontend.log 2>&1 &
    FRONTEND_PID=$!

    # Wait for frontend to start
    echo -e "${YELLOW}Waiting for frontend to start...${NC}"
    MAX_RETRIES=30
    RETRY_COUNT=0
    FRONTEND_READY=false

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            FRONTEND_READY=true
            break
        fi
        
        # Check if process is still running
        if ! kill -0 $FRONTEND_PID 2>/dev/null; then
            echo -e "${RED}❌ Frontend process died. Check logs:${NC}"
            tail -20 /tmp/travelback-frontend.log
            cleanup
            exit 1
        fi
        
        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep 1
    done

    if [ "$FRONTEND_READY" = "false" ]; then
        echo -e "${RED}❌ Frontend failed to start after ${MAX_RETRIES} seconds${NC}"
        echo -e "${YELLOW}Frontend logs:${NC}"
        tail -20 /tmp/travelback-frontend.log
        cleanup
        exit 1
    fi

    echo -e "${GREEN}✅ Frontend is running on http://localhost:5173${NC}\n"
fi

# Success message
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✨ TravelBack is ready! ✨          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}\n"
echo -e "${CYAN}Services:${NC}"
echo -e "  ${GREEN}✓${NC} Database:    PostgreSQL (localhost:5432)"
echo -e "  ${GREEN}✓${NC} Backend:     http://localhost:3000"
echo -e "  ${GREEN}✓${NC} Frontend:    http://localhost:5173\n"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}\n"

# Show logs in real-time (only for services we started)
if [ ! -z "$BACKEND_PID" ]; then
    echo -e "${CYAN}Backend logs (last 10 lines):${NC}"
    tail -10 /tmp/travelback-backend.log
fi
if [ ! -z "$FRONTEND_PID" ]; then
    if [ ! -z "$BACKEND_PID" ]; then
        echo -e "\n${CYAN}Frontend logs (last 10 lines):${NC}"
    else
        echo -e "${CYAN}Frontend logs (last 10 lines):${NC}"
    fi
    tail -10 /tmp/travelback-frontend.log
fi
if [ ! -z "$BACKEND_PID" ] || [ ! -z "$FRONTEND_PID" ]; then
    echo -e "\n${CYAN}Following logs (Ctrl+C to stop)...${NC}\n"
fi

# Follow logs (only if we started the processes)
if [ ! -z "$BACKEND_PID" ] || [ ! -z "$FRONTEND_PID" ]; then
    # Build list of log files to follow
    LOG_FILES=""
    if [ ! -z "$BACKEND_PID" ]; then
        LOG_FILES="/tmp/travelback-backend.log"
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        if [ -z "$LOG_FILES" ]; then
            LOG_FILES="/tmp/travelback-frontend.log"
        else
            LOG_FILES="$LOG_FILES /tmp/travelback-frontend.log"
        fi
    fi
    
    tail -f $LOG_FILES 2>/dev/null || {
        # If tail -f fails, just wait for processes we started
        if [ ! -z "$BACKEND_PID" ]; then
            wait $BACKEND_PID 2>/dev/null || true
        fi
        if [ ! -z "$FRONTEND_PID" ]; then
            wait $FRONTEND_PID 2>/dev/null || true
        fi
    }
else
    # Both services were already running, just wait for interrupt
    echo -e "${CYAN}All services are running. Waiting for Ctrl+C...${NC}"
    while true; do
        sleep 1
    done
fi

