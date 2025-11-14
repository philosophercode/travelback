#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BACKUP_FILE="${1}"

if [ -z "$BACKUP_FILE" ]; then
  echo -e "${RED}❌ Usage: $0 <backup-file.sql>${NC}"
  echo ""
  echo "Example:"
  echo "  $0 ./backups/travelback_backup_20240101_120000.sql"
  echo ""
  echo "Available backups:"
  if [ -d "./backups" ]; then
    ls -lh ./backups/*.sql 2>/dev/null | tail -5 || echo "  No backups found"
  else
    echo "  No backups directory found"
  fi
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}❌ Backup file not found: $BACKUP_FILE${NC}"
  exit 1
fi

# Load DATABASE_URL from .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ DATABASE_URL environment variable is not set${NC}"
  echo ""
  echo "Please set DATABASE_URL in your .env file or export it:"
  echo "  export DATABASE_URL=postgresql://user:password@host:port/database"
  exit 1
fi

echo -e "${YELLOW}⚠️  WARNING: This will overwrite all data in the database!${NC}"
echo "Database: $DATABASE_URL"
echo "Backup file: $BACKUP_FILE"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo -e "${BLUE}Restore cancelled${NC}"
  exit 0
fi

echo ""
echo -e "${BLUE}📥 Restoring database from backup...${NC}"

# Check if psql is available locally
if command -v psql &> /dev/null; then
  echo -e "${BLUE}Using local psql...${NC}"
  if psql "$DATABASE_URL" < "$BACKUP_FILE"; then
    SUCCESS=true
  else
    SUCCESS=false
  fi
# Check if Docker is available and database is localhost (Docker Compose)
elif command -v docker &> /dev/null && echo "$DATABASE_URL" | grep -q "localhost\|127.0.0.1"; then
  echo -e "${BLUE}Using Docker to run psql...${NC}"
  
  # Extract database connection details from DATABASE_URL
  # Format: postgresql://user:password@host:port/database
  # Use a more robust parsing method
  DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
  DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
  DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^/?]+).*|\1|')
  
  # Check if Docker container is running
  if ! docker ps --format '{{.Names}}' | grep -q "travelback-postgres"; then
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
  
  if PGPASSWORD="$DB_PASS" docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" "$DB_NAME" < "$BACKUP_FILE"; then
    SUCCESS=true
  else
    SUCCESS=false
  fi
else
  echo -e "${RED}❌ psql not found and Docker is not available${NC}"
  echo ""
  echo "Please install PostgreSQL client tools:"
  echo "  macOS: brew install postgresql"
  echo "  Ubuntu: sudo apt-get install postgresql-client"
  echo "  Or ensure Docker is running and your database is accessible"
  exit 1
fi

if [ "$SUCCESS" = true ]; then
  echo -e "${GREEN}✅ Database restored successfully!${NC}"
else
  echo -e "${RED}❌ Restore failed${NC}"
  exit 1
fi

