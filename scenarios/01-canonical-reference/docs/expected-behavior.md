# Expected Behavior by Phase

This document provides step-by-step expected behavior for each phase of the canonical scenario.

## Phase 0: Initial Startup (t=0 to t=30s)

### What Happens

1. Docker Compose brings up all services
2. PostgreSQL source initializes with seed data
3. Kafka and Zookeeper reach quorum
4. Debezium Connect starts and registers connector
5. Initial snapshot captures existing data
6. Sink consumer starts processing
7. Verifier begins comparison loop

### Expected State at t=30s

```
Source DB:     3 customers, 2 orders, 2 order_items
Sink DB:       3 customers, 2 orders, 2 order_items (via snapshot)
Verifier:      PASS
Consumer Lag:  0
```

### What Can Go Wrong

- Connector fails to register (Connect not ready)
- Snapshot fails (insufficient privileges)
- Consumer can't connect (Kafka not ready)

---

## Phase 1: Connector Restart (t=30s)

### Trigger

```bash
# Automatic via failure-injector, or manual:
make trigger-restart
```

### Expected Sequence

1. `DELETE /connectors/cdc-source-connector` - Connector stops
2. Events continue accumulating in source WAL
3. 10 second pause (events pile up)
4. `POST /connectors` - Connector re-registers
5. Connector resumes from last committed offset
6. Buffered events flow to Kafka

### Expected State After Recovery

```
Source DB:     ~5-10 new records during restart
Sink DB:       Same count (after catchup)
Verifier:      SYNC_IN_PROGRESS → PASS
Consumer Lag:  Spike then 0
```

### Key Observations

- Watch for `offset` in connector status
- Note any duplicate events in consumer logs
- Verifier should return to PASS within 30s

---

## Phase 2: Consumer Lag (t=60s)

### Trigger

```bash
# Automatic via failure-injector, or manual:
make trigger-lag
```

### Expected Sequence

1. Consumer receives SIGUSR1 (pause signal)
2. Consumer stops processing, events accumulate
3. 30 second pause
4. Consumer receives SIGUSR2 (resume signal)
5. Consumer catches up on backlog

### Expected State During Lag

```
t=60s:
  Source DB:     N records
  Sink DB:       N-X records (behind)
  Consumer Lag:  X events (growing)
  Verifier:      SYNC_IN_PROGRESS

t=90s (after resume):
  Consumer Lag:  0 (caught up)
  Verifier:      PASS
```

### Key Observations

- Lag should be visible in `make lag` output
- Retention is set to 5 minutes (for demo)
- If lag exceeds retention, data loss occurs

---

## Phase 3: Schema Evolution (t=90s)

### Trigger

```bash
# Automatic via failure-injector, or manual:
make trigger-schema
```

### Expected Sequence

1. `ALTER TABLE customers ADD COLUMN tier`
2. Debezium emits DDL change event
3. New inserts include `tier` column
4. Existing records don't have `tier`
5. Sink must handle mixed schema

### Expected State After Schema Change

```
Source schema: customers(id, name, email, ..., tier)
Sink schema:   customers(id, name, email, ...)  ← May not have tier yet

Events before: {"id": "1", "name": "Alice"}
Events after:  {"id": "10", "name": "New", "tier": "premium"}
```

### Key Observations

- Check `\d customers` in both source and sink
- Consumer should handle null tier gracefully
- If sink rejects unknown columns: ERROR

---

## Phase 4: Duplicate Events (t=120s)

### Trigger

```bash
# Automatic via failure-injector, or manual:
make trigger-duplicate
```

### Expected Sequence

1. Connector is deleted
2. Replication slot is dropped
3. Connector is re-registered
4. Fresh snapshot begins
5. ALL existing data re-emitted as 'r' (read) ops
6. Sink receives duplicates of everything

### Expected State After Re-snapshot

```
Without deduplication:
  Source: 50 customers
  Sink:   100 customers  ← BROKEN (duplicates)

With deduplication (this scenario):
  Source: 50 customers
  Sink:   50 customers   ← CORRECT (dedup worked)
```

### Key Observations

- Check `_cdc_dedup` table for processed offsets
- Verifier will show PASS if dedup works
- Row count match is the key indicator

---

## Phase 5: Backfill (t=150s)

### Trigger

```bash
# Automatic via failure-injector, or manual:
make trigger-backfill
```

### Expected Sequence

1. 20 historical customers inserted (created_at = 1 year ago)
2. ~20 historical orders inserted
3. Historical order items inserted
4. CDC captures as current events
5. Sink receives with current `_cdc_received`

### Expected State After Backfill

```
Source:
  - 20 new customers with created_at = 2023
  - 20 new orders with created_at = 2023

Sink:
  - Same records
  - _cdc_received = 2024 (today)
  - created_at = 2023 (original)
```

### Key Observations

- Query `SELECT * FROM customers ORDER BY _cdc_received DESC LIMIT 20`
- Note the discrepancy between business time and CDC time
- Time-windowed aggregates may be affected

---

## Verification Checkpoints

### After Each Phase

Run these checks:

```bash
# 1. Overall status
make status

# 2. Row counts
docker exec cdc-source psql -U postgres -d source -c \
  "SELECT 'customers', count(*) FROM customers UNION ALL
   SELECT 'orders', count(*) FROM orders UNION ALL
   SELECT 'order_items', count(*) FROM order_items;"

docker exec cdc-sink psql -U postgres -d sink -c \
  "SELECT 'customers', count(*) FROM customers UNION ALL
   SELECT 'orders', count(*) FROM orders UNION ALL
   SELECT 'order_items', count(*) FROM order_items;"

# 3. Consumer lag
make lag

# 4. Connector status
make connector-status
```

### Final State (t=180s+)

If everything worked correctly:

```
Verifier:       PASS
Source rows:    ~75-100 (varies based on generator)
Sink rows:      Same as source
Consumer Lag:   0
Duplicates:     0 (handled by dedup)
Schema:         Sink has `tier` column (may need manual add)
Historical:     20+ records with old created_at
```

---

## Troubleshooting

### Verifier Shows FAIL

1. Check `make status` for specific table
2. Look for orphans (in sink but not source)
3. Look for missing (in source but not sink)
4. Check consumer logs: `docker logs cdc-sink-consumer`

### Consumer Not Processing

1. Check if paused: `docker logs cdc-sink-consumer | grep PAUSED`
2. Check Kafka connectivity: `docker exec cdc-kafka kafka-topics --list`
3. Restart consumer: `docker restart cdc-sink-consumer`

### Connector in FAILED State

1. Get error: `make connector-status | jq '.tasks[0].trace'`
2. Common fixes:
   - Replication slot issue: Drop slot and restart
   - Connection issue: Check PostgreSQL logs
   - Permission issue: Check `GRANT` statements

### Schema Mismatch

1. Compare schemas: `\d customers` in both DBs
2. Add missing columns to sink manually
3. Re-run verifier

---

## Success Criteria

The scenario is successful if:

1. ✅ All five failure modes were triggered
2. ✅ Verifier shows PASS after each recovery
3. ✅ Final row counts match between source and sink
4. ✅ No data was lost (within retention window)
5. ✅ Duplicates were handled correctly
6. ✅ Schema change didn't break the pipeline
7. ✅ Backfill data is queryable with correct timestamps
