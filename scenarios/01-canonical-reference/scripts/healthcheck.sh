#!/bin/bash
# =============================================================================
# Startup Health Check for The Failure-Aware CDC Reference Pipeline
# =============================================================================
# Run after 'make up' to ensure all services are healthy and connected.
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
WAIT="${YELLOW}○${NC}"
SKIP="${BLUE}–${NC}"

MAX_WAIT=120
WAIT_INTERVAL=3

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  CDC Reference Pipeline - Startup Health Check"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Track overall status
ALL_HEALTHY=true

# -----------------------------------------------------------------------------
# Wait for service to be healthy
# -----------------------------------------------------------------------------
wait_for_service() {
    local name=$1
    local check_cmd=$2
    local max_wait=${3:-$MAX_WAIT}
    
    echo -n "  ${name}... "
    
    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        if eval "$check_cmd" &> /dev/null; then
            echo -e "${PASS} Ready (${elapsed}s)"
            return 0
        fi
        sleep $WAIT_INTERVAL
        elapsed=$((elapsed + WAIT_INTERVAL))
        echo -ne "\r  ${name}... ${WAIT} Waiting (${elapsed}s)     "
    done
    
    echo -e "\r  ${name}... ${FAIL} Timeout after ${max_wait}s"
    ALL_HEALTHY=false
    return 1
}

# -----------------------------------------------------------------------------
# Check container is running
# -----------------------------------------------------------------------------
check_container() {
    local name=$1
    echo -n "  ${name}... "
    
    if docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
        local status=$(docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null)
        local health=$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo "none")
        
        if [ "$status" = "running" ]; then
            if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
                echo -e "${PASS} Running"
                return 0
            else
                echo -e "${WAIT} Running but health=${health}"
                return 1
            fi
        else
            echo -e "${FAIL} Status: ${status}"
            ALL_HEALTHY=false
            return 1
        fi
    else
        echo -e "${FAIL} Not found"
        ALL_HEALTHY=false
        return 1
    fi
}

# -----------------------------------------------------------------------------
# Phase 1: Container Status
# -----------------------------------------------------------------------------
echo "Phase 1: Container Status"
echo "─────────────────────────────────────────────────────────────────────"

CONTAINERS="cdc-source cdc-sink cdc-zookeeper cdc-kafka cdc-connect cdc-sink-consumer cdc-verifier"

for container in $CONTAINERS; do
    check_container "$container"
done

echo ""

# -----------------------------------------------------------------------------
# Phase 2: Service Connectivity
# -----------------------------------------------------------------------------
echo "Phase 2: Service Connectivity"
echo "─────────────────────────────────────────────────────────────────────"

# Source PostgreSQL
wait_for_service "Source PostgreSQL" \
    "docker exec cdc-source pg_isready -U postgres -d source"

# Sink PostgreSQL
wait_for_service "Sink PostgreSQL" \
    "docker exec cdc-sink pg_isready -U postgres -d sink"

# Zookeeper
wait_for_service "Zookeeper" \
    "docker exec cdc-zookeeper bash -c 'echo ruok | nc localhost 2181 | grep -q imok'"

# Kafka
wait_for_service "Kafka" \
    "docker exec cdc-kafka kafka-broker-api-versions --bootstrap-server localhost:9092"

# Debezium Connect
wait_for_service "Debezium Connect" \
    "curl -sf http://localhost:8083/connectors"

# Verifier HTTP
wait_for_service "Verifier HTTP" \
    "curl -sf http://localhost:8089/health"

echo ""

# -----------------------------------------------------------------------------
# Phase 3: CDC Pipeline Validation
# -----------------------------------------------------------------------------
echo "Phase 3: CDC Pipeline Validation"
echo "─────────────────────────────────────────────────────────────────────"

# Check connector is registered
echo -n "  Debezium connector... "
CONNECTOR_STATUS=$(curl -sf http://localhost:8083/connectors/cdc-source-connector/status 2>/dev/null || echo "{}")
CONNECTOR_STATE=$(echo "$CONNECTOR_STATUS" | jq -r '.connector.state // "MISSING"' 2>/dev/null || echo "MISSING")

if [ "$CONNECTOR_STATE" = "RUNNING" ]; then
    echo -e "${PASS} Running"
elif [ "$CONNECTOR_STATE" = "MISSING" ]; then
    echo -e "${FAIL} Not registered"
    ALL_HEALTHY=false
else
    echo -e "${WARN} State: ${CONNECTOR_STATE}"
fi

# Check Kafka topics exist
echo -n "  Kafka topics... "
TOPICS=$(docker exec cdc-kafka kafka-topics --bootstrap-server localhost:9092 --list 2>/dev/null || echo "")
if echo "$TOPICS" | grep -q "cdc-source.public.customers"; then
    TOPIC_COUNT=$(echo "$TOPICS" | grep -c "cdc-source" || echo "0")
    echo -e "${PASS} ${TOPIC_COUNT} CDC topics created"
else
    echo -e "${WAIT} Topics not yet created (connector may be snapshotting)"
fi

# Check consumer group
echo -n "  Consumer group... "
CONSUMER_LAG=$(docker exec cdc-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group cdc-sink-consumer 2>/dev/null | grep -v "^$" | tail -n +2 || echo "")
if [ -n "$CONSUMER_LAG" ]; then
    LAG_SUM=$(echo "$CONSUMER_LAG" | awk '{sum+=$6} END {print sum+0}')
    echo -e "${PASS} Registered (current lag: ${LAG_SUM})"
else
    echo -e "${WAIT} Not yet registered (waiting for messages)"
fi

# Check source has data
echo -n "  Source data... "
SOURCE_COUNT=$(docker exec cdc-source psql -U postgres -d source -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
if [ -n "$SOURCE_COUNT" ] && [ "$SOURCE_COUNT" -gt 0 ]; then
    echo -e "${PASS} ${SOURCE_COUNT} customers in source"
else
    echo -e "${FAIL} No data in source (init may have failed)"
    ALL_HEALTHY=false
fi

# Check sink is receiving data
echo -n "  Sink data... "
SINK_COUNT=$(docker exec cdc-sink psql -U postgres -d sink -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
if [ -n "$SINK_COUNT" ] && [ "$SINK_COUNT" -gt 0 ]; then
    echo -e "${PASS} ${SINK_COUNT} customers in sink"
elif [ -n "$SINK_COUNT" ]; then
    echo -e "${WAIT} Sink empty (CDC may be in progress)"
else
    echo -e "${FAIL} Could not query sink"
    ALL_HEALTHY=false
fi

# Verifier status
echo -n "  Verifier status... "
VERIFY_STATUS=$(curl -sf http://localhost:8089/report 2>/dev/null | head -5 | grep -o "Status:.*" | cut -d: -f2 | tr -d ' ' || echo "UNKNOWN")
if [ "$VERIFY_STATUS" = "PASS" ]; then
    echo -e "${PASS} PASS - Source and sink match"
elif [ "$VERIFY_STATUS" = "SYNC_IN_PROGRESS" ]; then
    echo -e "${WAIT} Syncing (normal during startup)"
else
    echo -e "${YELLOW}${VERIFY_STATUS}${NC}"
fi

echo ""

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo "════════════════════════════════════════════════════════════════════"

if [ "$ALL_HEALTHY" = true ]; then
    echo -e "  ${GREEN}Pipeline is healthy!${NC}"
    echo ""
    echo "  Next steps:"
    echo "    make watch              # Monitor in real-time"
    echo "    make trigger-restart    # Trigger first failure"
    echo "    make demo               # Run interactive demo"
    echo ""
else
    echo -e "  ${RED}Some services are unhealthy${NC}"
    echo ""
    echo "  Troubleshooting:"
    echo "    make logs               # View all logs"
    echo "    docker logs cdc-connect # Check specific service"
    echo "    make reset              # Clean restart"
    echo ""
fi

echo "  Dashboard:  http://localhost:8089"
echo "  Connect:    http://localhost:8083/connectors"
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo ""

if [ "$ALL_HEALTHY" = true ]; then
    exit 0
else
    exit 1
fi
