# Harness Guide

This harness spins up Postgres + Debezium Kafka Connect, replays a shared scenario against the database, and verifies emitted change events.

## Prerequisites
- Docker Desktop (or `docker compose` CLI)
- Node.js 20+ (`npm install` already run at repo root)

## Quick start
```bash
# Choose a scenario from assets/shared-scenarios.js
npm run prepare:scenario -- crud-basic

# In a separate terminal run the stack
cd harness
make up

# Or run the multi-table transactions demo
SCENARIO=orders-transactions make up

# Follow logs / status
make logs
make status    # JSON report on http://localhost:8089/report
open http://localhost:8089   # HTML summary
```

## Iterating
- `make replay` triggers the generator again without resetting Kafka topics.
- `make snapshots` refreshes fixtures in `harness/fixtures/` from the canonical shared scenarios.
- `make down` tears the stack down when you’re finished.

When running `orders-transactions`, open the comparator with `Apply-on-commit` toggled on and off to watch downstream parity shift between partial and atomic applies.

Health checks gate the generator/verifier so they don’t run until Postgres, Kafka, and Connect are ready. Generator retries its connection loop, so you get deterministic start-up even on cold hosts.

## Reports
The verifier exposes JSON (`/report`) and HTML (`/`) views on port 8089. Both use the shared diff engine to flag missing/extra/out-of-order events and max lag so you can reason about CDC parity at a glance.
