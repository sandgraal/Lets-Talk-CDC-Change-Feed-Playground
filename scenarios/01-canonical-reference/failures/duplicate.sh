#!/bin/sh
# =============================================================================
# Failure: Duplicate Events (Re-snapshot)
# =============================================================================
#
# WHAT THIS DOES:
# Deletes and recreates the Debezium connector with snapshot.mode=initial,
# forcing a complete re-read of all existing data.
#
# WHY IT MATTERS:
# - Tests idempotency of sink operations
# - Reveals duplicate detection gaps
# - Shows the importance of upsert vs insert semantics
# - Demonstrates primary key handling
#
# EXPECTED BEHAVIOR:
# - All existing data is re-emitted as 'r' (read) operations
# - Sink receives duplicates of every existing row
# - Without proper dedup/upsert, row counts will be wrong
# - With proper handling, sink state should remain consistent
#
# =============================================================================

echo "=== DUPLICATE EVENTS FAILURE (RE-SNAPSHOT) ==="
echo "Timestamp: $(date -Iseconds)"
echo ""

# Get current state
echo "Step 1: Recording pre-snapshot state..."
echo "Source rows:"
docker exec cdc-source psql -U postgres -d source -t -c \
  "SELECT 'customers', count(*) FROM customers UNION ALL 
   SELECT 'orders', count(*) FROM orders UNION ALL 
   SELECT 'order_items', count(*) FROM order_items;"
echo ""

echo "Sink rows (before):"
docker exec cdc-sink psql -U postgres -d sink -t -c \
  "SELECT 'customers', count(*) FROM customers UNION ALL 
   SELECT 'orders', count(*) FROM orders UNION ALL 
   SELECT 'order_items', count(*) FROM order_items;"
echo ""

# Get connector config for re-registration
echo "Step 2: Saving connector config..."
CONNECTOR_CONFIG=$(cat /app/connectors/debezium-postgres.json)
echo "Config saved."
echo ""

# Delete the connector and its slot
echo "Step 3: Deleting connector..."
curl -s -X DELETE http://cdc-connect:8083/connectors/cdc-source-connector
echo ""

# Drop the replication slot to force fresh snapshot
echo "Step 4: Dropping replication slot..."
docker exec cdc-source psql -U postgres -d source -c \
  "SELECT pg_drop_replication_slot('cdc_slot');" 2>/dev/null || \
  echo "Slot already dropped or doesn't exist"
echo ""

# Wait a moment
echo "Step 5: Waiting 5s..."
sleep 5

# Re-register connector (will do fresh snapshot)
echo "Step 6: Re-registering connector (will trigger snapshot)..."
curl -s -X POST -H "Content-Type: application/json" \
  --data "$CONNECTOR_CONFIG" \
  http://cdc-connect:8083/connectors
echo ""

# Wait for snapshot to complete
echo "Step 7: Waiting 15s for snapshot..."
sleep 15

# Check sink state
echo "Step 8: Recording post-snapshot state..."
echo "Sink rows (after):"
docker exec cdc-sink psql -U postgres -d sink -t -c \
  "SELECT 'customers', count(*) FROM customers UNION ALL 
   SELECT 'orders', count(*) FROM orders UNION ALL 
   SELECT 'order_items', count(*) FROM order_items;"
echo ""

# Check for duplicates in dedup table
echo "Step 9: Checking dedup table..."
docker exec cdc-sink psql -U postgres -d sink -t -c \
  "SELECT count(*) as total_dedup_records FROM _cdc_dedup;" 2>/dev/null || \
  echo "Dedup table not available"
echo ""

echo "=== RE-SNAPSHOT COMPLETE ==="
echo "If sink row counts doubled, deduplication is not working."
echo "Check the verifier for data integrity."
