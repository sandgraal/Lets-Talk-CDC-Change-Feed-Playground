#!/bin/sh
# =============================================================================
# Failure: Consumer Lag
# =============================================================================
#
# WHAT THIS DOES:
# Pauses the sink consumer while the source continues writing,
# building up consumer group lag in Kafka.
#
# WHY IT MATTERS:
# - Tests Kafka retention pressure
# - Reveals monitoring blind spots (lag alerts)
# - Shows catchup behavior and ordering guarantees
# - Demonstrates the difference between processing time and event time
#
# EXPECTED BEHAVIOR:
# - Consumer stops processing messages
# - Kafka consumer group lag increases
# - If lag exceeds retention, data loss occurs
# - On resume, consumer catches up (may take time)
#
# =============================================================================

echo "=== CONSUMER LAG FAILURE ==="
echo "Timestamp: $(date -Iseconds)"
echo ""

PAUSE_DURATION=${1:-30}

# Get current lag
echo "Step 1: Recording pre-pause lag..."
docker exec cdc-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe \
  --group cdc-sink-consumer 2>/dev/null || echo "Could not get lag"
echo ""

# Pause the consumer by sending SIGUSR1
echo "Step 2: Pausing consumer for ${PAUSE_DURATION}s..."
docker kill --signal=SIGUSR1 cdc-sink-consumer 2>/dev/null || \
  docker pause cdc-sink-consumer 2>/dev/null || \
  echo "Note: Using container pause as fallback"
echo ""

# Wait while lag builds
echo "Step 3: Waiting ${PAUSE_DURATION}s for lag to build..."
for i in $(seq 1 $PAUSE_DURATION); do
  if [ $((i % 10)) -eq 0 ]; then
    echo "  ${i}s elapsed..."
    docker exec cdc-kafka kafka-consumer-groups \
      --bootstrap-server localhost:9092 \
      --describe \
      --group cdc-sink-consumer 2>/dev/null | grep -E "TOPIC|cdc-source" || true
  fi
  sleep 1
done
echo ""

# Resume the consumer
echo "Step 4: Resuming consumer..."
docker kill --signal=SIGUSR2 cdc-sink-consumer 2>/dev/null || \
  docker unpause cdc-sink-consumer 2>/dev/null || \
  echo "Note: Using container unpause as fallback"
echo ""

# Check post-resume lag
echo "Step 5: Recording post-resume lag (immediate)..."
docker exec cdc-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe \
  --group cdc-sink-consumer 2>/dev/null || echo "Could not get lag"
echo ""

echo "=== LAG TEST COMPLETE ==="
echo "Watch consumer catch up in the verifier report."
