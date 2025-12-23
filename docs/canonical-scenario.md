# The Failure-Aware CDC Reference Pipeline

> **This is the authoritative guide.** If your CDC demo doesn't show failure modes, it teaches nothing useful.

---

## Table of Contents

1. [Why This Matters](#why-this-matters)
2. [What Should Happen](#what-should-happen)
3. [What Actually Happens](#what-actually-happens)
4. [Where People Get It Wrong](#where-people-get-it-wrong)
5. [Agent Sizing Implications](#agent-sizing-implications)
6. [Recovery Patterns](#recovery-patterns)
7. [Quick Reference](#quick-reference)

---

## Why This Matters

CDC (Change Data Capture) is deceptively simple in demos. You set up Debezium, see events flow, and declare victory. Then production happens:

- The connector crashes at 3am
- A consumer falls behind during a traffic spike
- Someone adds a column without telling downstream teams
- A migration script inserts 10 million historical records
- The same event arrives twice

**Every single CDC pipeline will face these failures.** The question isn't _if_ but _how_ your system handles them.

This scenario intentionally triggers all five failure modes so you can:

1. See exactly what breaks
2. Understand why it breaks
3. Learn the correct recovery patterns
4. Size your agents appropriately

---

## What Should Happen

### The Happy Path

```
Source DB → Debezium → Kafka → Consumer → Sink DB
   ↓           ↓         ↓        ↓          ↓
 Writes    Captures   Stores   Processes   Applies
```

**Guarantees (in theory):**

- Every committed transaction appears in the stream
- Events appear in commit order
- Consumers can replay from any offset
- State eventually converges between source and sink

### Failure Mode 1: Connector Restart

**What should happen:**

1. Connector resumes from last committed Kafka offset
2. Any transaction in-progress at crash is re-captured
3. No events are lost
4. Sink receives all events (possibly with duplicates)

**Timing diagram:**

```
Source:   ───T1────T2────T3────T4────T5────T6───→
                        ↑
                     Crash here

Debezium: ───T1────T2────[crash]────T2────T3────T4────T5────T6───→
                                    ↑
                             Resumes from T2 (last committed)
```

### Failure Mode 2: Consumer Lag

**What should happen:**

1. Events accumulate in Kafka
2. Consumer group lag increases
3. When consumer resumes, it catches up
4. No data loss (if within retention window)

**Timing diagram:**

```
Kafka:    ───[E1]──[E2]──[E3]──[E4]──[E5]──[E6]──[E7]──[E8]───→
                    ↓                                ↓
Consumer: ───E1────E2────[pause]────────────────────E3→E8───→
                    ↑     Lag = 6 events             ↑
              Last processed                    Catches up
```

### Failure Mode 3: Schema Evolution

**What should happen:**

1. Debezium emits schema change event
2. New events include new column (with default or null)
3. Old events don't have the column
4. Sink schema is updated to accept new column
5. No data corruption

**Schema timeline:**

```
Time:     t=0          t=100        t=200
Schema:   v1           ALTER TABLE  v2
Events:   {a,b}        DDL event    {a,b,c}
Sink:     v1 ←─────── upgrade ─────→ v2
```

### Failure Mode 4: Duplicate Events

**What should happen:**

1. Events arrive more than once (same primary key)
2. Sink applies idempotent upsert
3. Final state matches source exactly
4. No duplicate rows in sink

**Deduplication flow:**

```
Kafka:    ───[E1]──[E1]──[E2]──[E3]──[E3]──[E3]───→
                ↓
Consumer: Check dedup table for (topic, partition, offset)
                ↓
Sink:     INSERT ... ON CONFLICT (pk) DO UPDATE ...
                ↓
Result:   E1, E2, E3 (each appearing exactly once)
```

### Failure Mode 5: Backfill

**What should happen:**

1. Historical data appears as new CDC events
2. Events have current Kafka timestamps but old business timestamps
3. Sink receives data in offset order (not created_at order)
4. Upsert semantics handle out-of-order arrival

**Ordering example:**

```
Source created_at:  Jan 1   Jan 15   Jan 30   Feb 1   Feb 15
CDC capture order:  ─────────────backfill──────────→ Feb 20
                    [Jan1] [Jan15] [Jan30] [Feb1] [Feb15]
                      ↓       ↓       ↓       ↓       ↓
Sink receives:      All appear on Feb 20 (CDC time)
                    But created_at shows original dates
```

---

## What Actually Happens

### Reality Check: Connector Restart

**What actually happens in poorly designed systems:**

| Symptom                            | Cause                                | Impact           |
| ---------------------------------- | ------------------------------------ | ---------------- |
| Missing events                     | Connector used `snapshot.mode=never` | Data loss        |
| Duplicate events                   | Connector offset was behind          | Inflated counts  |
| Replication slot grows unboundedly | Slot not dropped on restart          | Disk fills up    |
| Consumer sees gap                  | Retention exceeded during downtime   | Silent data loss |

**What you'll see in this scenario:**

```
Before restart: Source=100, Sink=100
After restart:  Source=115, Sink=118  ← 3 duplicates

Verifier: WARN - Row count mismatch (if no dedup)
          PASS - If dedup enabled
```

### Reality Check: Consumer Lag

**What actually happens in poorly designed systems:**

| Symptom           | Cause                               | Impact          |
| ----------------- | ----------------------------------- | --------------- |
| Data loss         | Lag exceeded Kafka retention        | Unrecoverable   |
| Memory exhaustion | Consumer buffered too much          | OOM crash       |
| Timeout errors    | Processing couldn't keep up         | Cascade failure |
| Rebalance storm   | Long processing triggered rebalance | Repeated work   |

**What you'll see in this scenario:**

```
t=0:    Lag=0
t=30:   Consumer paused, lag starts building
t=60:   Lag=150 (source kept writing)
t=61:   Consumer resumed
t=90:   Lag=0 (caught up)

Verifier: SYNC_IN_PROGRESS → PASS
```

### Reality Check: Schema Evolution

**What actually happens in poorly designed systems:**

| Symptom         | Cause                       | Impact             |
| --------------- | --------------------------- | ------------------ |
| Consumer crash  | Strict schema validation    | Pipeline stops     |
| Data corruption | Column type incompatibility | Silent bugs        |
| NULL everywhere | No default value            | Query breakage     |
| Schema drift    | No schema registry          | Inconsistent state |

**What you'll see in this scenario:**

```
Before ALTER: customers has columns [id, name, email, ...]
After ALTER:  customers has columns [..., tier]

Events before: {"id": "1", "name": "Alice", ...}
Events after:  {"id": "4", "name": "New User", ..., "tier": "premium"}

Sink behavior depends on:
- If sink has `tier` column: Success
- If sink doesn't: Error or ignored (depends on config)
```

### Reality Check: Duplicate Events

**What actually happens in poorly designed systems:**

| Symptom               | Cause                         | Impact             |
| --------------------- | ----------------------------- | ------------------ |
| Double rows           | INSERT not UPSERT             | Row count doubles  |
| Wrong totals          | Aggregates include duplicates | Business errors    |
| Constraint violations | Primary key conflict          | Consumer crash     |
| Phantom data          | Duplicates partially applied  | Inconsistent state |

**What you'll see in this scenario:**

```
Before re-snapshot: Sink customers=50
After re-snapshot (no dedup): Sink customers=100 ← BROKEN
After re-snapshot (with dedup): Sink customers=50 ← CORRECT

Verifier without dedup: FAIL - orphans detected
Verifier with dedup: PASS
```

### Reality Check: Backfill

**What actually happens in poorly designed systems:**

| Symptom              | Cause                                 | Impact          |
| -------------------- | ------------------------------------- | --------------- |
| Out-of-order data    | Business time ≠ CDC time              | Confusing state |
| Missing updates      | Backfill overwrote live data          | Data loss       |
| Performance collapse | Bulk insert triggered full re-process | Timeout         |
| Wrong aggregates     | Time-windowed queries incorrect       | Bad reports     |

**What you'll see in this scenario:**

```
Live data: Orders from Feb 2024
Backfill:  Orders from Jan 2023

CDC order: [Jan2023-Order1, Jan2023-Order2, ..., Feb2024-Latest]
           All captured on same day (today)

Sink receives: Historical data appearing as "new"
               created_at shows true date
               _cdc_received shows today
```

---

## Where People Get It Wrong

### Mistake 1: Assuming Exactly-Once Semantics

**The myth:** "Kafka provides exactly-once, so I don't need dedup."

**The reality:**

- Debezium provides **at-least-once** by default
- Exactly-once requires specific Kafka + Debezium configuration
- Even with exactly-once, re-snapshots create duplicates
- Network partitions can cause ambiguity

**The fix:**

```sql
-- Always use upsert, never insert
INSERT INTO customers (id, name, email)
VALUES ($1, $2, $3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email;
```

### Mistake 2: No Retention Planning

**The myth:** "Kafka keeps everything."

**The reality:**

- Default retention is 7 days (or less)
- Aggressive retention causes silent data loss
- Consumer lag + short retention = unrecoverable

**The fix:**

```yaml
# kafka config
log.retention.hours: 168 # 7 days
log.retention.bytes: -1 # unlimited by size

# Alert when lag approaches retention
alert: consumer_lag_seconds > (retention_hours * 0.8 * 3600)
```

### Mistake 3: Ignoring Schema Changes

**The myth:** "Our schema never changes."

**The reality:**

- It always changes
- Production DDL happens without warning
- Column additions are common
- Type changes are dangerous

**The fix:**

```json
// Use Schema Registry with compatibility mode
{
  "value.converter": "io.confluent.connect.avro.AvroConverter",
  "value.converter.schema.registry.url": "http://schema-registry:8081",
  "value.converter.schemas.enable": "true"
}
```

### Mistake 4: Point-in-Time Queries Without CDC Time

**The myth:** "I can query 'as of yesterday' using created_at."

**The reality:**

- `created_at` is business time
- CDC capture time is different
- Backfills break point-in-time semantics
- You need both timestamps

**The fix:**

```sql
-- Add CDC metadata columns
ALTER TABLE customers ADD COLUMN _cdc_captured_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN _cdc_lsn TEXT;

-- Query "as of CDC time" for debugging
SELECT * FROM customers WHERE _cdc_captured_at < '2024-02-01';

-- Query "as of business time" for reports
SELECT * FROM customers WHERE created_at < '2024-02-01';
```

### Mistake 5: No Verification

**The myth:** "If no errors, data is correct."

**The reality:**

- Silent corruption is common
- Row counts drift without errors
- Schema mismatches cause partial writes
- You won't know until an audit

**The fix:**

```javascript
// Continuous verification (like this scenario)
setInterval(async () => {
  const sourceCount = await sourceDb.query("SELECT count(*) FROM customers");
  const sinkCount = await sinkDb.query("SELECT count(*) FROM customers");

  if (sourceCount !== sinkCount) {
    alert("CDC drift detected", { source: sourceCount, sink: sinkCount });
  }
}, 60000);
```

---

## Agent Sizing Implications

When using AI agents to work with CDC pipelines, failure handling has direct implications for agent design.

### Context Window Requirements

| Failure Mode | Required Context                          | Why                                        |
| ------------ | ----------------------------------------- | ------------------------------------------ |
| Restart      | Connector config + offset state           | Agent needs to understand resume point     |
| Lag          | Consumer group metrics + retention config | Agent must calculate if data loss occurred |
| Schema       | Before/after DDL + compatibility rules    | Agent needs full schema history            |
| Duplicate    | Dedup table state + event keys            | Agent must verify idempotency              |
| Backfill     | Time ranges + ordering semantics          | Agent needs temporal reasoning             |

**Practical guidance:**

- Minimum context: ~8K tokens for simple failure analysis
- Recommended: 32K+ tokens for full pipeline state
- Include: Connector config, recent events, verification report, error logs

### Tool Requirements

Agents working with this pipeline need access to:

```yaml
required_tools:
  - database_query # Check source/sink state
  - kafka_consumer_lag # Monitor pipeline health
  - connector_status # Verify Debezium state
  - docker_exec # Run failure scripts
  - http_request # Hit verifier endpoint

optional_tools:
  - schema_registry # For schema evolution
  - log_aggregator # For error correlation
  - alerting_system # For notification
```

### Decision Trees for Agents

**When source ≠ sink row counts:**

```
Is consumer lag > 0?
  → Yes: Wait for catchup, re-verify
  → No: Check for duplicates
        Has dedup enabled?
          → Yes: Check dedup table for recent entries
          → No: Likely duplicate issue, recommend dedup
```

**When connector shows errors:**

```
Is error "replication slot does not exist"?
  → Yes: Slot was dropped, need re-snapshot
Is error "could not access file"?
  → Yes: WAL retention issue, check wal_keep_size
Is error "connection refused"?
  → Yes: Database connectivity, check network/credentials
```

### Memory and State Patterns

Agents should maintain:

```json
{
  "pipeline_state": {
    "last_verified_at": "2024-02-20T10:00:00Z",
    "source_row_counts": { "customers": 1500, "orders": 3200 },
    "sink_row_counts": { "customers": 1500, "orders": 3200 },
    "known_issues": [],
    "recent_failures": ["restart at t=30s, recovered"]
  },
  "recovery_history": [
    { "type": "restart", "duration_seconds": 15, "events_replayed": 23 }
  ]
}
```

---

## Recovery Patterns

### Pattern 1: Restart Recovery

```bash
# 1. Check connector status
curl http://localhost:8083/connectors/my-connector/status

# 2. If FAILED, check the error
curl http://localhost:8083/connectors/my-connector/status | jq '.tasks[0].trace'

# 3. Common fixes:
#    - Restart task: POST /connectors/my-connector/tasks/0/restart
#    - Delete and recreate: DELETE then POST /connectors

# 4. Verify recovery
make status  # Check verifier report
```

### Pattern 2: Lag Recovery

```bash
# 1. Check current lag
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group my-consumer-group

# 2. If lag is critical (approaching retention):
#    Option A: Scale consumers (if partitions allow)
#    Option B: Skip to latest (ACCEPTS DATA LOSS)
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group my-consumer-group --reset-offsets --to-latest --execute --all-topics

# 3. For normal lag, just wait and monitor
watch -n 5 'kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group my-consumer-group'
```

### Pattern 3: Schema Evolution Recovery

```sql
-- 1. Check sink schema vs source schema
\d source.customers
\d sink.customers

-- 2. Add missing columns to sink
ALTER TABLE customers ADD COLUMN tier VARCHAR(20);

-- 3. Backfill existing rows if needed
UPDATE customers SET tier = 'standard' WHERE tier IS NULL;

-- 4. Verify schema compatibility
-- (If using Schema Registry, check compatibility mode)
```

### Pattern 4: Duplicate Recovery

```sql
-- 1. Identify duplicates
SELECT id, count(*)
FROM customers
GROUP BY id
HAVING count(*) > 1;

-- 2. If duplicates exist, deduplicate
DELETE FROM customers a
USING customers b
WHERE a.ctid < b.ctid
AND a.id = b.id;

-- 3. Enable dedup going forward
-- (Configure consumer with dedup table)
```

### Pattern 5: Backfill Recovery

```sql
-- 1. Identify backfilled records
SELECT * FROM customers
WHERE _cdc_received > created_at + INTERVAL '7 days';

-- 2. Verify business logic handles late arrival
-- (Check time-windowed aggregates)

-- 3. If ordering matters, add processing
SELECT * FROM customers
ORDER BY
  CASE WHEN _cdc_received > created_at + INTERVAL '1 day'
       THEN 1 ELSE 0 END,  -- Backfills second
  created_at;
```

---

## Quick Reference

### Start the Scenario

```bash
cd scenarios/01-canonical-reference
make up
make watch
```

### Trigger Specific Failures

```bash
make trigger-restart      # Kill/restart Debezium
make trigger-lag          # Pause consumer 30s
make trigger-schema       # Add column
make trigger-duplicate    # Force re-snapshot
make trigger-backfill     # Insert historical data
```

### Check Status

```bash
make status               # Verification report
make connector-status     # Debezium health
make lag                  # Consumer group lag
```

### Debug

```bash
make source-shell         # psql to source
make sink-shell           # psql to sink
make kafka-topics         # List topics
make kafka-consume        # Read from topic
```

### Clean Up

```bash
make down                 # Stop containers
make clean                # Remove volumes
```

---

## Conclusion

CDC looks simple until it fails. This scenario makes failure visible so you can:

1. **See** what breaks (and how)
2. **Understand** why it breaks
3. **Practice** recovery patterns
4. **Size** your agents appropriately
5. **Build** confidence in your pipeline

**The goal isn't to prevent all failures—it's to handle them gracefully.**

---

_This scenario is the canonical reference. Everything else in this repository is optional enrichment._
