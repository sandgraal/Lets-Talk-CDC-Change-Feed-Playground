# Change Feed Evaluation Checklist

A quick, repeatable script for data engineers and architects to score change data capture options using the playground. Pair it with the comparator (`#simShellRoot`) so you can observe ordering, lag, and delete semantics across Polling, Trigger, and Log capture side by side.

## Quick start
1. Build bundles (comparator + simulator):
   ```bash
   npm run build
   ```
2. Open `index.html` (double-click or `open index.html`) and ensure **Comparator** is enabled via the feature flags banner if prompted.
3. Load a curated scenario from **Explore real-world scenarios** (recommended options below).
4. Toggle on the **Polling**, **Trigger**, and **Log** lanes; keep the **Metrics** and **Lane checks** panels visible.
5. Set **Apply on commit** to **on** for multi-table accuracy unless you are explicitly testing partial apply.
6. Run the scenario; keep the **Event Log** pinned and use **Export NDJSON** to capture the run for teammates.

## Core evaluation tracks
Each track answers a common architecture question. Use the suggested scenario, controls, and signals, then capture a short replay.

| Question | Scenario + controls | What to watch | Takeaways |
| --- | --- | --- | --- |
| **Baseline lag + ordering** – How far behind is each method under steady load? | **Omnichannel Orders**. Set **Polling interval** to 300–500 ms and keep **Log fetch** near 100 ms. Leave **Trigger overhead** at default. | **Lane checks** overlay for max lag and ordering chips; **Metrics** panel backlog/lag percentiles. | Polling shows the widest lag envelope; Log tracks real time; Trigger sits between depending on overhead. |
| **Trigger vs Outbox reliability** – Does application-managed outbox remove ordering risks? | **Outbox Relay**. Enable **Trigger** and **Log** only. Increase **Trigger overhead** to 120–150 ms. | **Lane diff overlay** to see Trigger delays; **Event Log** rows for `outbox_events` with `event_key`/`last_event_id`. | Outbox keeps business events ordered and deduplicable even when triggers lag; Log mirrors base table changes immediately. |
| **Snapshot + offset recovery** – What happens when snapshots replay historical rows? | **Snapshot Replay**. Run once with defaults, then enable **Drop snapshot rows** and **Dedupe on PK** in Event Log settings. | **Event Log** duplicates (e.g., `LED-100`), **Lane diff overlay** for duplicate suppression, **Apply on commit** for atomic multi-row updates. | Dedupe + drop-snapshot controls prevent ledger drift after replays; apply-on-commit keeps multi-row changes consistent. |
| **Schema evolution + multi-table commits** – Do schema changes and transactions stay atomic? | **Orders + Items Transactions** (or **Schema Evolution**). Enable **Schema demo** and toggle **Apply on commit** on and off while adding/dropping a column mid-run. | **Lane checks** to confirm transaction completeness, **Event Log** schema change events, **Workspace (live)** feed for downstream shape. | Log/Trigger capture schema instantly; Polling may lag. Apply-on-commit avoids partial multi-table updates during schema churn. |

## Evidence to collect
- **NDJSON export** from the Event Log for each run; share alongside the scenario name and knob settings.
- **Screenshot of Lane checks** showing lag/ordering chips per method.
- **Metrics panel snapshot** (produced/consumed counts, backlog, lag percentiles) to back discussions about SLOs.
- **Preference export** (`Export Scenario`) to let teammates reproduce the exact comparator configuration.

## Scoring rubric (suggested)
- **Lag**: median and p95 gap vs. source commit time per method.
- **Ordering**: frequency of out-of-order events or missing commits per method.
- **Delete semantics**: whether soft deletes, tombstones, or both are visible downstream.
- **Schema fidelity**: time to surface a column add/drop across sinks.
- **Operational fit**: need for database access (Log), trigger footprint, or polling load.

## Shareable outcomes
- Create a short table in your design doc: rows for each method, columns for lag, ordering, delete handling, schema propagation, operational notes.
- Attach exported NDJSON traces and screenshots so stakeholders can replay without rerunning the playground.
- Link back to this checklist and the **CDC Demo Playbook** for future onboarding.
