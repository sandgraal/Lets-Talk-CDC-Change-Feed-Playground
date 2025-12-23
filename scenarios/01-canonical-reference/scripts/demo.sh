#!/bin/bash
# =============================================================================
# Interactive Demo Mode for The Failure-Aware CDC Reference Pipeline
# =============================================================================
# Walks users through each failure mode with explanations and pauses.
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

clear

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   🎓 CDC Failure Modes - Interactive Demo${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "This demo will walk you through each failure mode, one at a time."
echo -e "After each failure, you'll see what happened and why it matters."
echo ""
echo -e "${CYAN}Before starting:${NC}"
echo "  1. Open http://localhost:8089 in your browser (Dashboard)"
echo "  2. Keep a terminal open with 'make watch' running"
echo ""
echo -e "Press ${GREEN}Enter${NC} to continue, ${RED}q${NC} to quit at any time."
echo ""

read -r input
if [[ "$input" == "q" ]]; then exit 0; fi

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------
wait_for_user() {
    echo ""
    echo -e "Press ${GREEN}Enter${NC} to continue..."
    read -r input
    if [[ "$input" == "q" ]]; then exit 0; fi
    echo ""
}

show_status() {
    echo -e "${CYAN}Current Status:${NC}"
    echo "─────────────────────────────────────────────────────────────────────"
    curl -s http://localhost:8089/report 2>/dev/null | head -15 || echo "  (verifier not available)"
    echo ""
}

# -----------------------------------------------------------------------------
# Introduction
# -----------------------------------------------------------------------------
clear
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   📖 What You'll Learn${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Every CDC pipeline faces these failures in production:"
echo ""
echo -e "  ${YELLOW}1. Connector Restart${NC} - When Debezium crashes and recovers"
echo -e "  ${YELLOW}2. Consumer Lag${NC}      - When consumers fall behind producers"
echo -e "  ${YELLOW}3. Schema Evolution${NC}  - When someone runs ALTER TABLE"
echo -e "  ${YELLOW}4. Duplicate Events${NC}  - When events are delivered more than once"
echo -e "  ${YELLOW}5. Backfill${NC}          - When historical data is bulk-loaded"
echo ""
echo "  The question isn't IF these will happen—it's HOW your pipeline handles them."
echo ""

wait_for_user

# -----------------------------------------------------------------------------
# Check baseline
# -----------------------------------------------------------------------------
clear
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   ✅ Baseline Check${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Let's verify the pipeline is healthy before we break things."
echo ""

show_status

echo ""
echo -e "${GREEN}What to look for:${NC}"
echo "  • Status: PASS (source and sink match)"
echo "  • Lag: 0 (no events waiting)"
echo "  • Row counts should match across all tables"
echo ""
echo -e "${YELLOW}If status is not PASS, wait a moment and check again.${NC}"

wait_for_user

# -----------------------------------------------------------------------------
# Failure 1: Connector Restart
# -----------------------------------------------------------------------------
clear
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   ${YELLOW}Failure 1: Connector Restart${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}What happens:${NC}"
echo "  The Debezium connector is killed mid-stream and restarted."
echo "  This simulates a crash, OOM, or deployment restart."
echo ""
echo -e "${CYAN}Why it matters:${NC}"
echo "  • Does the connector resume from the correct offset?"
echo "  • Are any events lost or duplicated?"
echo "  • How long until the pipeline recovers?"
echo ""
echo -e "${CYAN}What to watch:${NC}"
echo "  1. Dashboard: Status will briefly show SYNC_IN_PROGRESS"
echo "  2. Connector may emit duplicate events around the restart point"
echo "  3. Consumer should catch up within seconds"
echo ""
echo -e "${GREEN}Ready to trigger?${NC}"

wait_for_user

echo -e "${MAGENTA}>>> Triggering connector restart...${NC}"
echo ""

# Get pre-restart state
PRE_SOURCE=$(docker exec cdc-source psql -U postgres -d source -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
PRE_SINK=$(docker exec cdc-sink psql -U postgres -d sink -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')

echo "  Pre-restart: Source=$PRE_SOURCE, Sink=$PRE_SINK"
echo ""

# Kill connector
curl -s -X DELETE http://localhost:8083/connectors/cdc-source-connector > /dev/null 2>&1
echo "  • Connector deleted"

sleep 3
echo "  • Waiting 5s for events to accumulate..."
sleep 5

# Recreate connector
curl -s -X POST -H "Content-Type: application/json" \
  --data @./connectors/debezium-postgres.json \
  http://localhost:8083/connectors > /dev/null 2>&1
echo "  • Connector recreated"

sleep 5
echo "  • Waiting for recovery..."
sleep 5

# Get post-restart state
POST_SOURCE=$(docker exec cdc-source psql -U postgres -d source -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
POST_SINK=$(docker exec cdc-sink psql -U postgres -d sink -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')

echo ""
echo "  Post-restart: Source=$POST_SOURCE, Sink=$POST_SINK"
echo ""

show_status

echo -e "${GREEN}Key takeaways:${NC}"
echo "  • Debezium stores offsets in Kafka, so restarts are usually safe"
echo "  • At-least-once delivery means you may see duplicates"
echo "  • Your sink MUST use upsert/idempotent writes"

wait_for_user

# -----------------------------------------------------------------------------
# Failure 2: Consumer Lag
# -----------------------------------------------------------------------------
clear
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   ${YELLOW}Failure 2: Consumer Lag${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}What happens:${NC}"
echo "  The sink consumer is paused while the source keeps writing."
echo "  Events pile up in Kafka, creating consumer group lag."
echo ""
echo -e "${CYAN}Why it matters:${NC}"
echo "  • If lag exceeds Kafka retention, data is LOST"
echo "  • Large lag means stale data in the sink"
echo "  • Catchup time depends on consumer throughput"
echo ""
echo -e "${CYAN}What to watch:${NC}"
echo "  1. Dashboard: Lag counter will increase"
echo "  2. Source and sink row counts will diverge"
echo "  3. After resume, watch the catchup speed"
echo ""
echo -e "${GREEN}Ready to trigger?${NC}"

wait_for_user

echo -e "${MAGENTA}>>> Pausing consumer for 20 seconds...${NC}"
echo ""

# Pause consumer
docker pause cdc-sink-consumer 2>/dev/null || docker kill --signal=SIGUSR1 cdc-sink-consumer 2>/dev/null
echo "  • Consumer paused"

for i in {1..20}; do
    sleep 1
    LAG=$(docker exec cdc-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group cdc-sink-consumer 2>/dev/null | awk 'NR>1 {sum+=$6} END {print sum+0}')
    SOURCE=$(docker exec cdc-source psql -U postgres -d source -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
    SINK=$(docker exec cdc-sink psql -U postgres -d sink -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
    echo -ne "\r  ${i}s elapsed | Lag: $LAG | Source: $SOURCE | Sink: $SINK        "
done

echo ""
echo ""

# Resume consumer
docker unpause cdc-sink-consumer 2>/dev/null || docker kill --signal=SIGUSR2 cdc-sink-consumer 2>/dev/null
echo "  • Consumer resumed"
echo "  • Waiting for catchup..."

sleep 10

show_status

echo -e "${GREEN}Key takeaways:${NC}"
echo "  • Monitor consumer lag! Alert before it reaches retention"
echo "  • Kafka retention is set to 5 minutes in this demo"
echo "  • Scale consumers horizontally if lag is chronic"

wait_for_user

# -----------------------------------------------------------------------------
# Failure 3: Schema Evolution
# -----------------------------------------------------------------------------
clear
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   ${YELLOW}Failure 3: Schema Evolution${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}What happens:${NC}"
echo "  Someone runs ALTER TABLE to add a column."
echo "  Debezium captures the DDL change and new events have the column."
echo ""
echo -e "${CYAN}Why it matters:${NC}"
echo "  • Old events don't have the new column (null)"
echo "  • Sink schema must be updated to accept it"
echo "  • Schema Registry helps coordinate changes"
echo ""
echo -e "${CYAN}What to watch:${NC}"
echo "  1. Source schema changes immediately"
echo "  2. Debezium emits schema change event"
echo "  3. Sink may reject events or need manual update"
echo ""
echo -e "${GREEN}Ready to trigger?${NC}"

wait_for_user

echo -e "${MAGENTA}>>> Adding 'tier' column to customers table...${NC}"
echo ""

# Show before schema
echo "  Source schema before:"
docker exec cdc-source psql -U postgres -d source -c "\d customers" 2>/dev/null | head -15 || echo "  (query failed)"
echo ""

# Apply schema change
docker exec cdc-source psql -U postgres -d source -c "ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'standard';" 2>/dev/null
echo "  • Column added"

# Update some rows
docker exec cdc-source psql -U postgres -d source -c "UPDATE customers SET tier = 'premium' WHERE random() < 0.3;" 2>/dev/null
echo "  • Some customers updated to premium"

sleep 3

# Show after schema
echo ""
echo "  Source schema after:"
docker exec cdc-source psql -U postgres -d source -c "\d customers" 2>/dev/null | head -15 || echo "  (query failed)"

# Also update sink schema (normally this would be manual or via migration)
docker exec cdc-sink psql -U postgres -d sink -c "ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier VARCHAR(20);" 2>/dev/null
echo ""
echo "  • Sink schema also updated (in production, this might be a separate migration)"

sleep 5
show_status

echo -e "${GREEN}Key takeaways:${NC}"
echo "  • Schema changes propagate through CDC"
echo "  • Use Schema Registry for coordination"
echo "  • Test schema changes in staging first!"

wait_for_user

# -----------------------------------------------------------------------------
# Failure 4: Duplicate Events
# -----------------------------------------------------------------------------
clear
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   ${YELLOW}Failure 4: Duplicate Events${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}What happens:${NC}"
echo "  The connector is deleted and recreated, forcing a full re-snapshot."
echo "  ALL existing data is re-emitted to Kafka."
echo ""
echo -e "${CYAN}Why it matters:${NC}"
echo "  • Without deduplication, row counts DOUBLE"
echo "  • Aggregates become incorrect"
echo "  • This is why upsert semantics are critical"
echo ""
echo -e "${CYAN}What to watch:${NC}"
echo "  1. Consumer processes all existing data again"
echo "  2. With dedup enabled, counts should stay correct"
echo "  3. Without dedup, you'd see doubled data"
echo ""
echo -e "${RED}⚠️  This is the most dangerous failure mode.${NC}"
echo ""
echo -e "${GREEN}Ready to trigger?${NC}"

wait_for_user

echo -e "${MAGENTA}>>> Forcing re-snapshot (connector delete + slot drop + recreate)...${NC}"
echo ""

PRE_SOURCE=$(docker exec cdc-source psql -U postgres -d source -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
PRE_SINK=$(docker exec cdc-sink psql -U postgres -d sink -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
echo "  Before: Source=$PRE_SOURCE, Sink=$PRE_SINK"

# Delete connector
curl -s -X DELETE http://localhost:8083/connectors/cdc-source-connector > /dev/null 2>&1
echo "  • Connector deleted"

# Drop replication slot
docker exec cdc-source psql -U postgres -d source -c "SELECT pg_drop_replication_slot('cdc_slot');" 2>/dev/null || echo "  • Slot already dropped"
echo "  • Replication slot dropped"

sleep 3

# Recreate connector (will do fresh snapshot)
curl -s -X POST -H "Content-Type: application/json" \
  --data @./connectors/debezium-postgres.json \
  http://localhost:8083/connectors > /dev/null 2>&1
echo "  • Connector recreated (snapshot starting)"

echo "  • Waiting for snapshot to complete..."
sleep 15

POST_SOURCE=$(docker exec cdc-source psql -U postgres -d source -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
POST_SINK=$(docker exec cdc-sink psql -U postgres -d sink -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
echo ""
echo "  After: Source=$POST_SOURCE, Sink=$POST_SINK"

if [ "$PRE_SINK" = "$POST_SINK" ]; then
    echo -e "  ${GREEN}✓ Deduplication worked! Row count unchanged.${NC}"
else
    echo -e "  ${RED}✗ Row count changed - check dedup configuration${NC}"
fi

echo ""
show_status

echo -e "${GREEN}Key takeaways:${NC}"
echo "  • ALWAYS use upsert (INSERT ON CONFLICT DO UPDATE)"
echo "  • Dedup table tracks processed offsets"
echo "  • Re-snapshots are sometimes necessary (slot cleanup)"

wait_for_user

# -----------------------------------------------------------------------------
# Failure 5: Backfill
# -----------------------------------------------------------------------------
clear
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   ${YELLOW}Failure 5: Backfill${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}What happens:${NC}"
echo "  Historical data is bulk-inserted into the source."
echo "  These records have old created_at timestamps but current CDC timestamps."
echo ""
echo -e "${CYAN}Why it matters:${NC}"
echo "  • CDC time ≠ business time"
echo "  • Event order is by offset, not by created_at"
echo "  • Time-windowed queries may be affected"
echo ""
echo -e "${CYAN}What to watch:${NC}"
echo "  1. New records appear with old created_at dates"
echo "  2. _cdc_received will show today's date"
echo "  3. Sink row count increases"
echo ""
echo -e "${GREEN}Ready to trigger?${NC}"

wait_for_user

echo -e "${MAGENTA}>>> Inserting 20 historical customers (1 year old)...${NC}"
echo ""

PRE_COUNT=$(docker exec cdc-source psql -U postgres -d source -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
echo "  Before: $PRE_COUNT customers"

# Insert historical data
docker exec cdc-source psql -U postgres -d source -c "
INSERT INTO customers (external_id, name, email, created_at, updated_at)
SELECT 
  'HIST-' || to_char(n, 'FM000'),
  'Historical Customer ' || n,
  'hist.' || n || '@legacy.example.com',
  NOW() - INTERVAL '1 year' - (n || ' days')::interval,
  NOW() - INTERVAL '6 months' - (n || ' days')::interval
FROM generate_series(1, 20) AS n
ON CONFLICT (external_id) DO NOTHING;
" 2>/dev/null

echo "  • Historical records inserted"

sleep 5

POST_COUNT=$(docker exec cdc-source psql -U postgres -d source -t -c "SELECT count(*) FROM customers" 2>/dev/null | tr -d ' ')
echo "  After: $POST_COUNT customers"

echo ""
echo "  Sample of historical records (note created_at dates):"
docker exec cdc-source psql -U postgres -d source -c "
SELECT external_id, name, created_at::date, updated_at::date 
FROM customers 
WHERE external_id LIKE 'HIST-%' 
LIMIT 5;" 2>/dev/null

echo ""
sleep 5
show_status

echo -e "${GREEN}Key takeaways:${NC}"
echo "  • Track both business time (created_at) and CDC time (_cdc_received)"
echo "  • Backfills appear as 'new' events to CDC"
echo "  • Design your queries to handle late-arriving data"

wait_for_user

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
clear
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   🎉 Demo Complete!${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "You've experienced all five major CDC failure modes:"
echo ""
echo -e "  ${GREEN}✓${NC} Connector Restart - Offset management and recovery"
echo -e "  ${GREEN}✓${NC} Consumer Lag      - Backpressure and retention"
echo -e "  ${GREEN}✓${NC} Schema Evolution  - DDL propagation"
echo -e "  ${GREEN}✓${NC} Duplicate Events  - Idempotency requirements"
echo -e "  ${GREEN}✓${NC} Backfill          - Late-arriving historical data"
echo ""
echo -e "${CYAN}Key lessons:${NC}"
echo ""
echo "  1. ${BOLD}Use upsert, not insert${NC} - Duplicates WILL happen"
echo "  2. ${BOLD}Monitor consumer lag${NC} - Alert before retention"
echo "  3. ${BOLD}Test schema changes${NC} - Coordinate with Schema Registry"
echo "  4. ${BOLD}Track CDC timestamps${NC} - Separate from business time"
echo "  5. ${BOLD}Design for failure${NC} - It's not IF but WHEN"
echo ""
echo -e "${MAGENTA}Final Status:${NC}"
echo ""
show_status

echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  • Review the documentation: docs/canonical-scenario.md"
echo "  • Explore the dashboard: http://localhost:8089"
echo "  • Try triggering failures manually: make trigger-*"
echo "  • Clean up: make reset"
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo ""
