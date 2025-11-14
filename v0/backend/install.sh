#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 TravelBack Installation Script${NC}\n"

# Check Node.js version
echo -e "${YELLOW}Checking Node.js version...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 20+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}❌ Node.js version 20+ is required. Current version: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v) detected${NC}\n"

# Check Docker
echo -e "${YELLOW}Checking Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker is installed and running${NC}\n"

# Start PostgreSQL container
echo -e "${YELLOW}Starting PostgreSQL container...${NC}"
cd "$(dirname "$0")"

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^travelback-postgres$"; then
    if docker ps --format '{{.Names}}' | grep -q "^travelback-postgres$"; then
        echo -e "${GREEN}✅ PostgreSQL container is already running${NC}"
    else
        echo -e "${YELLOW}PostgreSQL container exists but is stopped. Starting it...${NC}"
        docker start travelback-postgres
    fi
else
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

# Create .env file if it doesn't exist
ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}.env file already exists.${NC}"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Skipping .env file creation${NC}\n"
    else
        rm "$ENV_FILE"
        CREATE_ENV=true
    fi
else
    CREATE_ENV=true
fi

if [ "$CREATE_ENV" = true ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    
    # Prompt for OpenAI API Key
    echo -e "${BLUE}Please enter your OpenAI API Key:${NC}"
    read -s OPENAI_API_KEY
    echo
    
    if [ -z "$OPENAI_API_KEY" ]; then
        echo -e "${RED}❌ OpenAI API Key is required${NC}"
        exit 1
    fi
    
    # Create .env file with defaults
    cat > "$ENV_FILE" << EOF
# Database
DATABASE_URL=postgresql://postgres:dev123@localhost:5432/travelback

# OpenAI
OPENAI_API_KEY=${OPENAI_API_KEY}

# Server
PORT=3000
NODE_ENV=development

# LLM Configuration
LLM_TEXT_MODEL=gpt-5-nano
LLM_VISION_MODEL=gpt-5-nano
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=5000

# Storage
STORAGE_PROVIDER=local
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10

# Processing
MAX_CONCURRENT_PHOTOS=3
EOF
    
    echo -e "${GREEN}✅ .env file created${NC}\n"
fi

# Install npm dependencies
echo -e "${YELLOW}Installing npm dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}\n"

# Create uploads directory
echo -e "${YELLOW}Creating uploads directory...${NC}"
mkdir -p uploads
echo -e "${GREEN}✅ Uploads directory created${NC}\n"

# Setup database schema
echo -e "${YELLOW}Setting up database schema...${NC}"
npm run db:setup
echo -e "${GREEN}✅ Database schema created${NC}\n"

echo -e "${GREEN}✨ Installation complete!${NC}\n"
echo -e "${BLUE}To start the application, run:${NC}"
echo -e "${BLUE}  ./start.sh${NC}\n"
echo -e "${BLUE}Or manually:${NC}"
echo -e "${BLUE}  npm run dev${NC}\n"

