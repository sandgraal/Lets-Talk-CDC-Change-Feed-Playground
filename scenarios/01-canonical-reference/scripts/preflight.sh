#!/bin/bash
# =============================================================================
# Prerequisite Check for The Failure-Aware CDC Reference Pipeline
# =============================================================================
# Run this before 'make up' to ensure your environment is ready.
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
WARN="${YELLOW}⚠${NC}"

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  CDC Reference Pipeline - Prerequisite Check"
echo "════════════════════════════════════════════════════════════════════"
echo ""

ERRORS=0
WARNINGS=0

# -----------------------------------------------------------------------------
# Check Docker
# -----------------------------------------------------------------------------
echo -n "Checking Docker... "
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
    echo -e "${PASS} Docker ${DOCKER_VERSION}"
else
    echo -e "${FAIL} Docker not found"
    echo "   Install: https://docs.docker.com/get-docker/"
    ERRORS=$((ERRORS + 1))
fi

# -----------------------------------------------------------------------------
# Check Docker Compose
# -----------------------------------------------------------------------------
echo -n "Checking Docker Compose... "
if docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "v2+")
    echo -e "${PASS} Docker Compose ${COMPOSE_VERSION}"
elif command -v docker-compose &> /dev/null; then
    echo -e "${WARN} docker-compose (legacy) found"
    echo "   Consider upgrading to Docker Compose V2"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${FAIL} Docker Compose not found"
    echo "   Install: https://docs.docker.com/compose/install/"
    ERRORS=$((ERRORS + 1))
fi

# -----------------------------------------------------------------------------
# Check Docker daemon is running
# -----------------------------------------------------------------------------
echo -n "Checking Docker daemon... "
if docker info &> /dev/null; then
    echo -e "${PASS} Running"
else
    echo -e "${FAIL} Not running"
    echo "   Start Docker Desktop or run: sudo systemctl start docker"
    ERRORS=$((ERRORS + 1))
fi

# -----------------------------------------------------------------------------
# Check available memory
# -----------------------------------------------------------------------------
echo -n "Checking available memory... "
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    TOTAL_MEM=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
    TOTAL_MEM_GB=$((TOTAL_MEM / 1073741824))
else
    # Linux
    TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
    TOTAL_MEM_GB=$((TOTAL_MEM_KB / 1048576))
fi

if [ "$TOTAL_MEM_GB" -ge 8 ]; then
    echo -e "${PASS} ${TOTAL_MEM_GB}GB (recommended: 8GB+)"
elif [ "$TOTAL_MEM_GB" -ge 4 ]; then
    echo -e "${WARN} ${TOTAL_MEM_GB}GB (may be slow, 8GB+ recommended)"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${FAIL} ${TOTAL_MEM_GB}GB (minimum 4GB required)"
    ERRORS=$((ERRORS + 1))
fi

# -----------------------------------------------------------------------------
# Check Docker memory allocation (Docker Desktop)
# -----------------------------------------------------------------------------
echo -n "Checking Docker memory limit... "
DOCKER_MEM=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)
DOCKER_MEM_GB=$((DOCKER_MEM / 1073741824))
if [ "$DOCKER_MEM_GB" -ge 4 ]; then
    echo -e "${PASS} ${DOCKER_MEM_GB}GB allocated to Docker"
elif [ "$DOCKER_MEM_GB" -gt 0 ]; then
    echo -e "${WARN} ${DOCKER_MEM_GB}GB allocated (4GB+ recommended)"
    echo "   Docker Desktop → Settings → Resources → Memory"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${WARN} Could not determine Docker memory limit"
    WARNINGS=$((WARNINGS + 1))
fi

# -----------------------------------------------------------------------------
# Check available disk space
# -----------------------------------------------------------------------------
echo -n "Checking disk space... "
if [[ "$OSTYPE" == "darwin"* ]]; then
    AVAIL_KB=$(df -k . | tail -1 | awk '{print $4}')
else
    AVAIL_KB=$(df -k . | tail -1 | awk '{print $4}')
fi
AVAIL_GB=$((AVAIL_KB / 1048576))

if [ "$AVAIL_GB" -ge 10 ]; then
    echo -e "${PASS} ${AVAIL_GB}GB available"
elif [ "$AVAIL_GB" -ge 5 ]; then
    echo -e "${WARN} ${AVAIL_GB}GB available (10GB+ recommended)"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${FAIL} ${AVAIL_GB}GB available (need at least 5GB)"
    ERRORS=$((ERRORS + 1))
fi

# -----------------------------------------------------------------------------
# Check required ports
# -----------------------------------------------------------------------------
echo ""
echo "Checking required ports..."

check_port() {
    local port=$1
    local service=$2
    echo -n "  Port $port ($service)... "
    
    if lsof -i :$port &> /dev/null || nc -z localhost $port 2>/dev/null; then
        CURRENT=$(lsof -i :$port 2>/dev/null | tail -1 | awk '{print $1}' || echo "unknown")
        echo -e "${FAIL} In use by ${CURRENT}"
        echo "     Stop the service or change the port mapping"
        return 1
    else
        echo -e "${PASS} Available"
        return 0
    fi
}

check_port 5432 "Source PostgreSQL" || ERRORS=$((ERRORS + 1))
check_port 5433 "Sink PostgreSQL" || ERRORS=$((ERRORS + 1))
check_port 9092 "Kafka" || ERRORS=$((ERRORS + 1))
check_port 2181 "Zookeeper" || ERRORS=$((ERRORS + 1))
check_port 8083 "Debezium Connect" || ERRORS=$((ERRORS + 1))
check_port 8089 "Verifier" || ERRORS=$((ERRORS + 1))
check_port 3000 "Dashboard (optional)" || WARNINGS=$((WARNINGS + 1))

# -----------------------------------------------------------------------------
# Check curl and jq (optional but helpful)
# -----------------------------------------------------------------------------
echo ""
echo "Checking optional tools..."

echo -n "  curl... "
if command -v curl &> /dev/null; then
    echo -e "${PASS} Available"
else
    echo -e "${WARN} Not found (needed for 'make status')"
    WARNINGS=$((WARNINGS + 1))
fi

echo -n "  jq... "
if command -v jq &> /dev/null; then
    echo -e "${PASS} Available"
else
    echo -e "${WARN} Not found (JSON formatting will be limited)"
    echo "     Install: brew install jq (macOS) or apt install jq (Linux)"
    WARNINGS=$((WARNINGS + 1))
fi

echo -n "  watch... "
if command -v watch &> /dev/null; then
    echo -e "${PASS} Available"
else
    echo -e "${WARN} Not found ('make watch' won't work)"
    echo "     Install: brew install watch (macOS)"
    WARNINGS=$((WARNINGS + 1))
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "════════════════════════════════════════════════════════════════════"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "  ${GREEN}All checks passed!${NC} Ready to run:"
    echo ""
    echo "    make up"
    echo ""
elif [ $ERRORS -eq 0 ]; then
    echo -e "  ${YELLOW}${WARNINGS} warning(s)${NC} - Pipeline should work but may have issues"
    echo ""
    echo "  You can proceed with:"
    echo "    make up"
    echo ""
else
    echo -e "  ${RED}${ERRORS} error(s)${NC}, ${WARNINGS} warning(s)"
    echo ""
    echo "  Please fix the errors above before running 'make up'"
    echo ""
    exit 1
fi

echo "════════════════════════════════════════════════════════════════════"
echo ""
