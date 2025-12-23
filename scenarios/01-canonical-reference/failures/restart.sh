#!/bin/sh
# =============================================================================
# Failure: Connector Restart
# =============================================================================
# 
# WHAT THIS DOES:
# Simulates an unexpected Debezium connector crash and restart.
#
# WHY IT MATTERS:
# - Tests offset management and recovery
# - Reveals duplicate vs missing event handling
# - Shows the difference between at-least-once and exactly-once semantics
#
# EXPECTED BEHAVIOR:
# - Connector stops capturing events
# - Events accumulate in source (WAL)
# - On restart, connector resumes from last committed offset
# - May see duplicate events if connector crashed mid-transaction
#
# =============================================================================

echo "=== CONNECTOR RESTART FAILURE ===" 
echo "Timestamp: $(date -Iseconds)"
echo ""

# Get current connector status
echo "Step 1: Recording pre-restart state..."
BEFORE_STATUS=$(curl -s http://cdc-connect:8083/connectors/cdc-source-connector/status)
echo "Connector status: $BEFORE_STATUS"
echo ""

# Delete the connector (simulates crash)
echo "Step 2: Killing connector (DELETE)..."
curl -s -X DELETE http://cdc-connect:8083/connectors/cdc-source-connector
echo ""

# Wait for some events to accumulate in source
echo "Step 3: Waiting 10s for events to accumulate in source..."
sleep 10

# Re-register the connector
echo "Step 4: Restarting connector..."
curl -s -X POST -H "Content-Type: application/json" \
  --data @/app/connectors/debezium-postgres.json \
  http://cdc-connect:8083/connectors
echo ""

# Wait for connector to stabilize
echo "Step 5: Waiting 5s for connector to stabilize..."
sleep 5

# Check new status
echo "Step 6: Recording post-restart state..."
AFTER_STATUS=$(curl -s http://cdc-connect:8083/connectors/cdc-source-connector/status)
echo "Connector status: $AFTER_STATUS"
echo ""

echo "=== RESTART COMPLETE ==="
echo "Watch the verifier for any duplicate or missing events."
