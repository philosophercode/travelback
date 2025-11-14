#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load DATABASE_URL from .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ DATABASE_URL environment variable is not set${NC}"
  echo ""
  echo "Please set DATABASE_URL in your .env file or export it:"
  echo "  export DATABASE_URL=postgresql://user:password@host:port/database"
  echo ""
  echo "Or add it to .env file:"
  echo "  DATABASE_URL=postgresql://user:password@host:port/database"
  exit 1
fi

# Create backups directory if it doesn't exist
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/travelback_backup_${TIMESTAMP}.sql"

echo -e "${BLUE}📦 Creating database backup...${NC}"
echo "Database: $DATABASE_URL"
echo "Output: $BACKUP_FILE"
echo ""

# Check if pg_dump is available locally
if command -v pg_dump &> /dev/null; then
  echo -e "${BLUE}Using local pg_dump...${NC}"
  DUMP_CMD="pg_dump"
  USE_DOCKER=false
# Check if Docker is available and database is localhost (Docker Compose)
elif command -v docker &> /dev/null && echo "$DATABASE_URL" | grep -q "localhost\|127.0.0.1"; then
  echo -e "${BLUE}Using Docker to run pg_dump...${NC}"
  USE_DOCKER=true
  
  # Extract database connection details from DATABASE_URL
  # Format: postgresql://user:password@host:port/database
  # Use a more robust parsing method
  DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
  DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
  DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^/?]+).*|\1|')
  
  # Check if Docker container is running
  if ! docker ps --format '{{.Names}}' | grep -q "travelback-postgres"; then
    echo -e "${YELLOW}⚠️  Docker container 'travelback-postgres' not found. Trying to find PostgreSQL container...${NC}"
    # Try to find any postgres container
    POSTGRES_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1)
    if [ -z "$POSTGRES_CONTAINER" ]; then
      echo -e "${RED}❌ No PostgreSQL Docker container found. Please start your database first.${NC}"
      echo "   Run: docker-compose up -d"
      exit 1
    fi
    echo -e "${BLUE}Found container: $POSTGRES_CONTAINER${NC}"
  else
    POSTGRES_CONTAINER="travelback-postgres"
  fi
  
  DUMP_CMD="docker exec $POSTGRES_CONTAINER pg_dump -U $DB_USER $DB_NAME"
else
  echo -e "${RED}❌ pg_dump not found and Docker is not available${NC}"
  echo ""
  echo "Please install PostgreSQL client tools:"
  echo "  macOS: brew install postgresql"
  echo "  Ubuntu: sudo apt-get install postgresql-client"
  echo "  Or ensure Docker is running and your database is accessible"
  exit 1
fi

# Create backup
if [ "$USE_DOCKER" = true ]; then
  # For Docker, we need to set PGPASSWORD and redirect output
  if PGPASSWORD="$DB_PASS" $DUMP_CMD > "$BACKUP_FILE"; then
    SUCCESS=true
  else
    SUCCESS=false
  fi
else
  # For local pg_dump, use DATABASE_URL directly
  if $DUMP_CMD "$DATABASE_URL" > "$BACKUP_FILE"; then
    SUCCESS=true
  else
    SUCCESS=false
  fi
fi

if [ "$SUCCESS" = true ]; then
  # Get file size
  FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  
  echo -e "${GREEN}✅ Backup created successfully!${NC}"
  echo ""
  echo "Backup file: $BACKUP_FILE"
  echo "Size: $FILE_SIZE"
  echo ""
  echo -e "${BLUE}💡 To restore this backup:${NC}"
  echo "   ./restore-db.sh $BACKUP_FILE"
  echo ""
  echo -e "${BLUE}💡 Or manually restore:${NC}"
  if [ "$USE_DOCKER" = true ]; then
    echo "   docker exec -i $POSTGRES_CONTAINER psql -U $DB_USER $DB_NAME < $BACKUP_FILE"
  else
    echo "   psql \$DATABASE_URL < $BACKUP_FILE"
  fi
else
  echo -e "${RED}❌ Backup failed${NC}"
  exit 1
fi

