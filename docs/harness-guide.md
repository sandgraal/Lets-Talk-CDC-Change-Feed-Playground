# Harness Guide

This harness spins up Postgres + Debezium Kafka Connect, replays a shared scenario against the database, and verifies emitted change events. It mirrors the in-browser simulator: the generator writes source mutations, the change-capture connector appends to Kafka topics, and the verifier consumes offsets in order—exactly how the in-memory `EventBus` behaves in `src/engine/eventBus.ts`.

## Prerequisites
- Docker Desktop (or `docker compose` CLI)
- Node.js 20+ (`npm install` already run at repo root)

**Note:** The Dockerfiles configure npm with `strict-ssl=false` to handle certificate issues in CI/corporate network environments. This is safe for development/testing harnesses but should be reviewed for production deployments.

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

### How the harness maps to the playground

- **Producer parity** – the generator mirrors `src/modes/*` adapters. Watching harness logs while the web comparator runs helps trace how inserts/updates/deletes should schedule commits and offsets.
- **Transport parity** – Kafka topics expose offsets and partitions that line up with the simulator `EventBus`. When debugging ordering or backlog mismatches, compare the harness report offsets to the in-app Event Log.
- **Consumer parity** – the verifier respects pause/resume semantics just like the comparator’s downstream consumer. Use it to validate backlog and lag calculations when tweaking `MetricsStore` logic.

#### Event bus + metrics mapping

| Harness signal | Playground source | Where to look |
| --- | --- | --- |
| Topic backlog / offsets | `EventBus.getBacklog()` / `getLastOffset()` | `src/engine/eventBus.ts` and `src/ui/components/MetricsStrip.tsx` |
| Lag percentiles | `MetricsStore.observeLag()` | `src/engine/metrics.ts` and comparator metrics dashboard |
| Produced vs consumed counts | `MetricsStore.incrementProduced()/incrementConsumed()` | Event Log header + metrics strip |
| Snapshot row totals | `MetricsStore.recordSnapshotRows()` | Event Log header + schema walkthrough |
| Missed deletes / write amplification | Mode-specific metrics hooks | Scenario diff overlay + metrics dashboard |

When runs diverge, trace the metric pipeline: harness report → `reports/harness-history.md` → `src/ui/components/LaneDiffOverlay.tsx`. The same diff primitives render in both environments, so a regression in the harness almost always surfaces as chips or warnings in the comparator.

## Iterating
- `make replay` triggers the generator again without resetting Kafka topics.
- `make snapshots` refreshes fixtures in `harness/fixtures/` from the canonical shared scenarios.
- `make down` tears the stack down when you’re finished.

When running `orders-transactions`, open the comparator with `Apply-on-commit` toggled on and off to watch downstream parity shift between partial and atomic applies.

Health checks gate the generator/verifier so they don’t run until Postgres, Kafka, and Connect are ready. Generator retries its connection loop, so you get deterministic start-up even on cold hosts.

## Reports
The verifier exposes JSON (`/report`) and HTML (`/`) views on port 8089. Both use the shared diff engine to flag missing/extra/out-of-order events and max lag so you can reason about CDC parity at a glance. The same diff heuristics feed the lane diff overlay in `src/ui/components/LaneDiffOverlay.tsx`, so discrepancies surfaced in the harness translate directly to UI badges.

Nightly automation runs `npm run ci:harness` against the Orders + Items Transactions scenario and uploads both `harness-report.json` and `harness-report.html` under the **Harness Nightly** workflow in GitHub Actions. Download the latest run to inspect table-level summaries and field-level mismatches without bringing the stack up locally.
Configure the `SLACK_WEBHOOK_URL` repository secret to receive PASS/FAIL notifications from the nightly job in Slack.

To review history without downloading individual artifacts, run `npm run harness:history` with a `GITHUB_TOKEN` that can read workflow artifacts. The script writes a markdown summary to `reports/harness-history.md`, including table-level row counts and any mismatches detected by the nightly harness.
