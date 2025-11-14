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

# Check if a Docker container is using the port
check_docker_port_usage() {
    local port="$1"
    # Check if any Docker container is using this port
    local container_info
    container_info=$(docker ps --format "{{.Names}}\t{{.Ports}}" 2>/dev/null | grep ":${port}->" || true)
    if [ -n "$container_info" ]; then
        local container_name
        container_name=$(echo "$container_info" | awk '{print $1}' | head -1)
        echo "$container_name"
        return 0
    fi
    return 1
}

# Ensure a local port is free or offer to kill the processes using it
ensure_port_available() {
    local port="$1"
    local service_name="$2"
    local container_name="$3"  # Optional: name of our container

    if ! command -v lsof >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  lsof not available. Skipping port ${port} check for ${service_name}.${NC}"
        return
    fi

    # First check if a Docker container is using this port
    local docker_container
    if docker_container=$(check_docker_port_usage "$port"); then
        if [ -n "$container_name" ] && [ "$docker_container" = "$container_name" ]; then
            # Our container is using the port - that's fine if it's running
            echo -e "${GREEN}✅ Port ${port} is used by our ${container_name} container${NC}"
            return
        else
            echo -e "${RED}❌ Port ${port} is already in use by Docker container: ${docker_container}${NC}"
            local response
            read -r -p "$(printf "${YELLOW}Stop this container so %s can start? [y/N]: ${NC}" "$service_name")" response
            
            if [[ "$response" =~ ^[Yy]$ ]]; then
                echo -e "${YELLOW}Stopping container ${docker_container}...${NC}"
                if docker stop "$docker_container" 2>/dev/null; then
                    echo -e "${GREEN}✅ Stopped container ${docker_container}${NC}"
                    sleep 1
                    # Verify port is now free
                    if docker_container=$(check_docker_port_usage "$port"); then
                        echo -e "${RED}❌ Port ${port} is still in use. Please free it manually.${NC}"
                        exit 1
                    fi
                    return
                else
                    echo -e "${RED}❌ Failed to stop container ${docker_container}. Please stop it manually.${NC}"
                    exit 1
                fi
            else
                echo -e "${RED}Cannot continue while port ${port} is occupied. Please stop the container and rerun the script.${NC}"
                echo -e "${YELLOW}Run: docker stop ${docker_container}${NC}"
                exit 1
            fi
        fi
    fi

    local port_details
    port_details=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)

    if [ -z "$port_details" ]; then
        return
    fi

    echo -e "${RED}❌ Port ${port} is already in use. Details:${NC}"
    echo "$port_details"
    local response
    read -r -p "$(printf "${YELLOW}Kill these process(es) so %s can start? [y/N]: ${NC}" "$service_name")" response

    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo -e "${RED}Cannot continue while port ${port} is occupied. Please free it and rerun the script.${NC}"
        exit 1
    fi

    local port_pids
    port_pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
    local killed_any=false
    local skipped_processes=""

    for pid in $port_pids; do
        local cmd
        cmd=$(ps -p "$pid" -o comm= 2>/dev/null | tr -d '[:space:]' || true)
        local full_cmd
        full_cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)

        # Determine what type of process this is based on service name
        local should_kill=false
        local process_type=""
        
        if [[ "$service_name" == "PostgreSQL" ]]; then
            # Only kill Postgres processes for database port
            if [[ "$cmd" == "postgres" || "$cmd" == "postmaster" || "$cmd" == "psql" ]]; then
                should_kill=true
                process_type="Postgres"
            fi
        elif [[ "$service_name" == "Backend" || "$service_name" == "Frontend" ]]; then
            # For backend/frontend, kill any process using the port
            # (since it's blocking our service from starting)
            should_kill=true
            process_type="${cmd:-unknown}"
        fi

        if [ "$should_kill" = true ]; then
            if kill "$pid" 2>/dev/null; then
                echo -e "${GREEN}✅ Terminated ${process_type} process (PID ${pid}) on port ${port}.${NC}"
                killed_any=true
            else
                echo -e "${RED}❌ Failed to terminate process (PID ${pid}). Please free port ${port} manually.${NC}"
                echo -e "${YELLOW}You may need to run: kill -9 ${pid}${NC}"
                exit 1
            fi
        else
            echo -e "${YELLOW}⚠️  Skipping PID ${pid} (${cmd:-unknown}) - not a ${service_name} process.${NC}"
            skipped_processes="${skipped_processes}\n  PID ${pid} (${cmd:-unknown})"
        fi
    done

    if [ "$killed_any" = false ]; then
        echo -e "${RED}❌ No processes were terminated. Please free port ${port} manually.${NC}"
        if [ -n "$skipped_processes" ]; then
            echo -e "${YELLOW}Processes using port ${port}:${skipped_processes}${NC}"
        fi
        echo -e "${YELLOW}You may need to stop other services or Docker containers using port ${port}.${NC}"
        exit 1
    fi

    echo -e "${YELLOW}Waiting for port ${port} to be released...${NC}"
    sleep 1

    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        echo -e "${RED}❌ Port ${port} is still in use. Please free it manually and rerun.${NC}"
        if [ -n "$skipped_processes" ]; then
            echo -e "${YELLOW}Processes left untouched:${skipped_processes}${NC}"
        fi
        exit 1
    fi
}

# Check if a value contains <ADD_KEY_HERE> placeholder
is_placeholder() {
    local value="$1"
    # Trim whitespace
    value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    # Check for empty value
    if [ -z "$value" ]; then
        return 0  # Is a placeholder
    fi
    
    # Only check for <ADD_KEY_HERE> pattern (case-insensitive)
    if [[ "$value" =~ \<.*[Aa][Dd][Dd].*[Kk][Ee][Yy].*[Hh][Ee][Rr][Ee].*\> ]]; then
        return 0  # Is a placeholder
    fi
    
    return 1  # Not a placeholder
}

# Check .env file for placeholders
check_env_for_placeholders() {
    local env_file="$1"
    local has_placeholders=false
    local placeholder_vars=()
    
    if [ ! -f "$env_file" ]; then
        return 1  # File doesn't exist, no placeholders
    fi
    
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines
        if [[ -z "$line" ]]; then
            continue
        fi
        
        # Remove leading/trailing whitespace for checking
        local trimmed_line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        
        # Skip lines that are comments (start with #)
        if [[ "$trimmed_line" =~ ^# ]]; then
            continue
        fi
        
        # Extract variable name and value (only if line is not commented)
        if [[ "$line" =~ ^[[:space:]]*([A-Z_]+)=(.*)$ ]]; then
            local var_name="${BASH_REMATCH[1]}"
            local value="${BASH_REMATCH[2]}"
            # Trim whitespace from value
            value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            
            # Remove inline comments (everything after # that's not in quotes)
            # Simple approach: remove # and everything after if # is present
            if [[ "$value" =~ ^([^#]*)# ]]; then
                value="${BASH_REMATCH[1]}"
                value=$(echo "$value" | sed 's/[[:space:]]*$//')  # Trim trailing space
            fi
            
            # Check if value is a placeholder
            if is_placeholder "$value"; then
                has_placeholders=true
                placeholder_vars+=("$var_name")
            fi
        fi
    done < "$env_file"
    
    if [ "$has_placeholders" = true ]; then
        echo -e "${YELLOW}⚠️  Found placeholders in .env file that need to be filled:${NC}"
        for var in "${placeholder_vars[@]}"; do
            echo -e "${YELLOW}   - ${var}${NC}"
        done
        echo -e "${RED}❌ Please edit ${env_file} and fill in the missing values before continuing.${NC}"
        echo -e "${YELLOW}After editing, run ./start.sh again.${NC}"
        return 0  # Has placeholders
    fi
    
    return 1  # No placeholders
}

# Create .env file from .env.example, prompting for missing required values
create_env_file() {
    local env_file="${BACKEND_DIR}/.env"
    local env_example="${BACKEND_DIR}/.env.example"
    
    echo -e "${CYAN}📝 Setting up backend .env file...${NC}"
    
    # If .env already exists, check it for placeholders
    if [ -f "$env_file" ]; then
        if check_env_for_placeholders "$env_file"; then
            exit 1
        fi
        echo -e "${GREEN}✅ .env file exists and is properly configured${NC}\n"
        return 0
    fi
    
    # Check if .env.example exists - it's required
    if [ ! -f "$env_example" ]; then
        echo -e "${RED}❌ .env.example file not found at ${env_example}${NC}"
        echo -e "${YELLOW}Please create a .env.example file with your configuration template.${NC}"
        exit 1
    fi
    
    # Read .env.example and create .env
    echo -e "${YELLOW}Reading .env.example and creating .env file...${NC}"
    
    # Create .env from .env.example, copying as-is
    cp "$env_example" "$env_file"
    
    # Check if there are any placeholders that need to be filled
    if check_env_for_placeholders "$env_file"; then
        exit 1
    else
        echo -e "${GREEN}✅ Created .env file from .env.example${NC}\n"
    fi
}

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

# Check port availability if container is not running
# (needed both for new containers and when restarting stopped containers)
if [ "$CONTAINER_RUNNING" != "true" ]; then
    ensure_port_available 5432 "PostgreSQL" "travelback-postgres"
fi

if [ "$CONTAINER_RUNNING" = "true" ]; then
    echo -e "${GREEN}✅ PostgreSQL container is already running${NC}"
elif [ "$CONTAINER_EXISTS" = "true" ]; then
    echo -e "${YELLOW}PostgreSQL container exists but is stopped. Starting it...${NC}"
    if ! docker start travelback-postgres 2>/dev/null; then
        echo -e "${RED}❌ Failed to start container. Checking port again...${NC}"
        ensure_port_available 5432 "PostgreSQL" "travelback-postgres"
        echo -e "${YELLOW}Retrying container start...${NC}"
        docker start travelback-postgres
    fi
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

# Create .env file if it doesn't exist
ENV_CREATED=false
if [ ! -f "${BACKEND_DIR}/.env" ]; then
    create_env_file
    ENV_CREATED=true
else
    create_env_file  # Still call it to ensure .env exists (it will return early)
fi

# Check if database schema exists and set it up if needed
echo -e "${CYAN}🔍 Checking database schema...${NC}"
cd "$BACKEND_DIR"

# Check if trips table exists
TRIPS_EXISTS=$(docker exec travelback-postgres psql -U postgres -d travelback -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'trips');" 2>/dev/null || echo "false")

if [ "$TRIPS_EXISTS" != "t" ]; then
    # Schema missing - automatically set it up
    echo -e "${YELLOW}⚠️  Database schema not found. Setting it up automatically...${NC}"
    if npm run db:setup > /tmp/travelback-db-setup.log 2>&1; then
        echo -e "${GREEN}✅ Database schema created${NC}\n"
    else
        echo -e "${RED}❌ Failed to create database schema. Check logs:${NC}"
        tail -20 /tmp/travelback-db-setup.log
        echo -e "${YELLOW}You can try running manually: cd backend && npm run db:setup${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Database schema already exists${NC}\n"
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

# Check if backend is already running (verify it's actually our backend)
BACKEND_IS_OURS=false
if curl -s http://localhost:3000/health 2>/dev/null | grep -q '"status":"ok"'; then
    BACKEND_IS_OURS=true
fi

# Always check port 3000 - if something is using it but it's not our backend, kill it
if [ "$BACKEND_IS_OURS" = true ]; then
    echo -e "${GREEN}✅ Backend is already running on http://localhost:3000${NC}"
    echo -e "${YELLOW}   Using existing instance.${NC}\n"
    BACKEND_PID=""
    BACKEND_READY=true
else
    # Check if port is in use
    if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port 3000 is in use by another service.${NC}"
        ensure_port_available 3000 "Backend" ""
    fi
    
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
    # Check port 5173 availability before starting frontend
    ensure_port_available 5173 "Frontend" ""
    
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
