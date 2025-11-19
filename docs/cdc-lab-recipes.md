# CDC Lab Recipes

Hands-on walkthroughs for showcasing change data capture behaviors in the playground. Each lab runs entirely from `index.html` once the bundles are built (`npm run build`), and focuses on an observable outcome that data engineers and architects can discuss with stakeholders.

## Prerequisites
- Build bundles: `npm run build` (required for the comparator and metrics panels).
- Enable comparator feature flags if you customized `APPWRITE_CFG.featureFlags`. For a full surface, leave `featureFlags` empty or include `ff_schema_demo`, `ff_multitable`, `ff_trigger_mode`, and `ff_walkthrough`.
- Load a curated scenario from the gallery to match the recipe below (e.g., **Omnichannel Orders** or **Outbox Relay**).

## Lab 1 – Polling vs Log Lag on Fulfilment Updates
Use the **Omnichannel Orders** scenario to demonstrate how extractor cadence drives observable lag.

1. Open **Omnichannel Orders** and ensure **Polling** and **Log** methods are enabled in the comparator lanes.
2. Set **Polling interval** to 300–500 ms; keep **Log fetch** at its default (~100 ms).
3. Play the scenario; pause when the order transitions from `ready_for_pickup` to `collected`.
4. Open the **Lane checks** overlay and note the **max lag** and **ordering** chips for Polling vs Log.
5. Discuss trade-offs: Polling is simpler but shows higher lag; Log is faster but depends on WAL/binlog access.

**What to highlight**
- Ordering overlays show how Polling can deliver the fulfilment delete late.
- Metrics panel contrasts backlog and lag percentiles per method.

## Lab 2 – Trigger Overhead and Outbox Dedupe
Contrast trigger-based capture with an application-managed outbox using **Outbox Relay**.

1. Enable **Trigger** and **Log** lanes; keep **Polling** off to simplify the view.
2. In the **Trigger** lane, set **Trigger overhead** to 120–150 ms to simulate heavy per-write work.
3. Play the scenario and watch the outbox rows (`outbox_events`) appear alongside order updates.
4. Inspect **Lane diff** overlays: Trigger may lag after each insert, while Log stays close to real time.
5. Use the **Workspace (live)** feed to confirm that downstream subscribers can dedupe using `event_key` and `last_event_id`.

**What to highlight**
- Outbox pattern keeps business events ordered even if triggers slow down.
- Dedupe keys (`event_key`, `last_event_id`) prevent duplicate dispatch on retries.

## Lab 3 – Schema Evolution with Apply-on-Commit
Show schema change capture and transactional consistency using **Orders + Items Transactions** (or any multi-table scenario).

1. Ensure **Apply on commit** is toggled **on** in the comparator header.
2. Enable **Schema demo** in feature flags if you previously restricted features; otherwise it is on by default.
3. In the **Schema walkthrough**, add a column (e.g., `fulfilment_window`) mid-run, then drop it after a few events.
4. Play the scenario; when a multi-table transaction arrives, open **Inspect** in the lane summary.
5. Observe that downstream tables receive all rows atomically once every event in the transaction is present, even with schema changes in flight.

**What to highlight**
- Apply-on-commit avoids partial updates across related tables.
- Schema change events propagate immediately on Log/Trigger while Polling may show delayed awareness.

## Lab 4 – Soft Deletes vs Physical Deletes
Use **Retention & Erasure** to explain delete handling and GDPR erasure workflows.

1. Enable **Polling** and **Log** lanes; toggle **Show soft deletes** on in the Polling controls.
2. Play the scenario until privacy deletes fire.
3. Compare the event log: Polling surfaces soft deletes (null or masked fields) while Log captures physical deletes.
4. Export NDJSON and point out how downstream consumers can filter or mask sensitive fields based on the capture method.

**What to highlight**
- Polling plus soft-delete visibility supports legal-hold workflows without hard deletion.
- Log capture ensures tombstones propagate for sinks that require hard deletes.

## Lab 5 – Snapshot Replay and Offset Resets
Demonstrate how to keep downstream sinks consistent when snapshots or offsets replay historical rows using **Snapshot Replay**.

1. Load **Snapshot Replay** and enable **Polling** and **Log** (keep **Trigger** off for signal clarity).
2. Run once with default Event Log settings to surface the duplicate insert for `LED-100` when the snapshot replays at `t=190`.
3. Toggle **Drop snapshot rows** and **Dedupe on PK** in the Event Log toolbar, then rerun.
4. Open the **Lane diff overlay** to confirm duplicate rows are suppressed and ordering stays aligned despite the replayed snapshot.
5. Use **Apply on commit** while re-running to show how multi-row ledger updates stay atomic even during catch-up.

**What to highlight**
- Snapshot replays and offset resets often re-emit historical rows; downstream dedupe is essential.
- PK-based dedupe plus drop-snapshot controls prevent ledger drift when recovering from outages.
- Pairing dedupe with apply-on-commit keeps multi-row ledger changes consistent across sinks during resyncs.

## Tips for Live Demos
- Keep the **Lane checks** overlay pinned while running labs to anchor the discussion on measurable lag and ordering.
- Use the **Load in workspace** shortcut from the comparator to let participants tweak scenarios interactively after the guided run.
- Reset to **CRUD Basic** between sessions to clear preferences and event buffers.
