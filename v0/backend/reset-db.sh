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
  exit 1
fi

SCHEMA_FILE="./src/database/schema.sql"

if [ ! -f "$SCHEMA_FILE" ]; then
  echo -e "${RED}❌ Schema file not found: $SCHEMA_FILE${NC}"
  exit 1
fi

echo -e "${YELLOW}⚠️  WARNING: This will DELETE ALL DATA in the database!${NC}"
echo "Database: $DATABASE_URL"
echo "Schema file: $SCHEMA_FILE"
echo ""
read -p "Are you sure you want to reset the database? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo -e "${BLUE}Reset cancelled${NC}"
  exit 0
fi

echo ""
echo -e "${BLUE}🔄 Resetting database...${NC}"

# Extract database connection details for Docker if needed
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^/?]+).*|\1|')

# Check if psql is available locally
if command -v psql &> /dev/null; then
  echo -e "${BLUE}Using local psql...${NC}"
  
  # Drop all tables (in reverse order of dependencies)
  echo -e "${YELLOW}Dropping existing tables...${NC}"
  psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS day_itineraries CASCADE;" 2>/dev/null || true
  psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS photos CASCADE;" 2>/dev/null || true
  psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS trips CASCADE;" 2>/dev/null || true
  
  # Recreate schema
  echo -e "${YELLOW}Creating schema...${NC}"
  if psql "$DATABASE_URL" -f "$SCHEMA_FILE"; then
    SUCCESS=true
  else
    SUCCESS=false
  fi
# Check if Docker is available and database is localhost
elif command -v docker &> /dev/null && echo "$DATABASE_URL" | grep -q "localhost\|127.0.0.1"; then
  echo -e "${BLUE}Using Docker to run psql...${NC}"
  
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
  
  # Drop all tables (in reverse order of dependencies)
  echo -e "${YELLOW}Dropping existing tables...${NC}"
  PGPASSWORD="$DB_PASS" docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" "$DB_NAME" -c "DROP TABLE IF EXISTS day_itineraries CASCADE;" 2>/dev/null || true
  PGPASSWORD="$DB_PASS" docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" "$DB_NAME" -c "DROP TABLE IF EXISTS photos CASCADE;" 2>/dev/null || true
  PGPASSWORD="$DB_PASS" docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" "$DB_NAME" -c "DROP TABLE IF EXISTS trips CASCADE;" 2>/dev/null || true
  
  # Recreate schema
  echo -e "${YELLOW}Creating schema...${NC}"
  if PGPASSWORD="$DB_PASS" docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" "$DB_NAME" < "$SCHEMA_FILE"; then
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
  echo -e "${GREEN}✅ Database reset successfully!${NC}"
  echo ""
  echo "The database has been reset to a clean state with the schema."
else
  echo -e "${RED}❌ Database reset failed${NC}"
  exit 1
fi

