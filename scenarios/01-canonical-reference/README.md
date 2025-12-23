# The Failure-Aware CDC Reference Pipeline

> **This is the canonical scenario.** Everything else in this repository is optional enrichment.

## Why This Exists

CDC demos that only show the happy path teach nothing. Real CDC pipelines fail—and _how_ they fail determines whether your architecture survives production.

This scenario intentionally triggers every common failure mode:

| Failure Mode          | What It Teaches                                                |
| --------------------- | -------------------------------------------------------------- |
| **Connector Restart** | Offset management, exactly-once vs at-least-once semantics     |
| **Consumer Lag**      | Backpressure, retention policies, monitoring blind spots       |
| **Schema Evolution**  | Compatibility modes, registry coordination, tombstone handling |
| **Duplicate Events**  | Idempotency requirements, deduplication strategies             |
| **Backfill**          | Snapshot vs streaming, ordering guarantees, merge patterns     |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    01-canonical-reference Pipeline                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   Postgres   │────▶│   Debezium   │────▶│    Kafka     │                │
│  │  (source)    │     │  (capture)   │     │  (stream)    │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│        │                     │                    │                         │
│        │                     │                    │                         │
│        ▼                     ▼                    ▼                         │
│   WAL (logical         Offset stored        Topic retention                │
│   replication)         in Kafka             & partitioning                 │
│                                                   │                         │
│                                                   │                         │
│                                                   ▼                         │
│                                          ┌──────────────┐                  │
│                                          │    Sink DB   │                  │
│                                          │  (target)    │                  │
│                                          └──────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Start the full pipeline
make up

# Watch the failure scenarios unfold
make watch

# Trigger specific failures
make trigger-restart       # Kill and restart Debezium
make trigger-lag           # Pause consumer to build lag
make trigger-schema        # ALTER TABLE to add column
make trigger-duplicate     # Force connector re-snapshot
make trigger-backfill      # Insert historical data

# View the verification report
make status

# Tear down
make down
```

## What Gets Deployed

| Component          | Image                           | Purpose                                  |
| ------------------ | ------------------------------- | ---------------------------------------- |
| `postgres-source`  | postgres:15-alpine              | Source database with logical replication |
| `kafka`            | confluentinc/cp-kafka:7.6.0     | Event streaming backbone                 |
| `zookeeper`        | confluentinc/cp-zookeeper:7.6.0 | Kafka coordination                       |
| `connect`          | debezium/connect:2.6            | CDC connector runtime                    |
| `postgres-sink`    | postgres:15-alpine              | Target database for verification         |
| `sink-consumer`    | node:20-alpine                  | Kafka consumer that writes to sink       |
| `verifier`         | node:20-alpine                  | Compares source vs sink state            |
| `failure-injector` | node:20-alpine                  | Triggers failure scenarios on schedule   |

## Directory Structure

```
01-canonical-reference/
├── README.md                    # You are here
├── docker-compose.yml           # Full pipeline definition
├── Makefile                     # Orchestration commands
├── scenario.json                # Failure sequence definition
│
├── source/
│   └── init.sql                 # Source schema + seed data
│
├── connectors/
│   └── debezium-postgres.json   # Connector configuration
│
├── sink/
│   ├── init.sql                 # Sink schema (intentionally different)
│   └── consumer.mjs             # Kafka-to-Postgres consumer
│
├── failures/
│   ├── restart.sh               # Connector restart script
│   ├── lag.sh                   # Consumer pause script
│   ├── schema-evolution.sql     # ALTER TABLE statements
│   ├── duplicate.sh             # Force re-snapshot
│   └── backfill.sql             # Historical data insert
│
├── verifier/
│   └── verify.mjs               # Source vs sink comparison
│
└── docs/
    └── expected-behavior.md     # What should happen at each step
```

## The Scenarios

### 1. Restart Recovery (t=30s)

**What happens:** Debezium connector is killed mid-stream and restarted.

**What to observe:**

- Events in-flight at crash time
- Offset resume position
- Any duplicate or missing events

### 2. Consumer Lag (t=60s)

**What happens:** Sink consumer is paused while source continues writing.

**What to observe:**

- Kafka consumer group lag
- Topic retention pressure
- Catchup behavior

### 3. Schema Evolution (t=90s)

**What happens:** `ALTER TABLE customers ADD COLUMN tier VARCHAR(20);`

**What to observe:**

- Debezium schema change event
- Sink schema compatibility
- Events during transition period

### 4. Duplicate Events (t=120s)

**What happens:** Connector is deleted and recreated, forcing re-snapshot.

**What to observe:**

- Duplicate detection at sink
- Idempotency handling
- State divergence

### 5. Backfill (t=150s)

**What happens:** Historical data inserted directly into source (simulating migration).

**What to observe:**

- Timestamp ordering vs offset ordering
- Merge vs replace semantics
- Verification results

## Related Documentation

- [Full Scenario Guide](../../docs/canonical-scenario.md) - Deep dive into each failure mode
- [Agent Sizing Implications](../../docs/canonical-scenario.md#agent-sizing) - What this means for AI agents
- [Recovery Patterns](../../docs/canonical-scenario.md#recovery-patterns) - How to handle each failure
