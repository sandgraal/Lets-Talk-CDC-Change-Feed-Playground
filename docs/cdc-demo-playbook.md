# CDC Demo Playbook

Use these scripts to deliver crisp, repeatable walkthroughs of the playground for data engineers and architects. Each flow pairs a curated scenario with the comparator controls so you can highlight why different capture methods behave the way they do.

For a fast orientation to the comparator UI before presenting these flows, skim the [CDC Method Comparator Guide](./comparator-guide.md).

## Prerequisites

- Run `npm install && npm run build` to generate `assets/generated/` bundles.
- Open `index.html` from the project root (double-click or `open index.html`).
- Confirm the comparator is visible (`Preparing simulator preview…` goes away once bundles are built).
- Reset the workspace via **Clear workspace** if a previous session left residual state.

## Quick reference

| Demo | Best for | Controls to tweak |
| ---- | -------- | ----------------- |
| CRUD basics | Showing delete visibility and polling lag | Polling interval + soft-delete visibility |
| Schema evolution | Column backfills and schema drift | Add column, backfill toggle, trigger vs. log comparison |
| Orders + items transactions | Multi-table atomicity and apply-on-commit | Apply-on-commit toggle + lag overlays |
| Outbox relay | Contrasting change feed vs. application-managed outbox | Enable Polling + Log + Trigger, then enable snapshot drop / dedupe |
| Snapshot replay | Offset resets and re-seeding change feeds | Drop snapshot rows + dedupe on PK toggles |
| Retention & erasure | Privacy deletes, masking, and retention windows | Soft delete visibility + Drop snapshot + Dedupe on PK |

## Demo 1 – CRUD basics and delete capture

1. Load the **CRUD Basic** scenario from the gallery or comparator quick-pick.
2. Enable the **Polling** and **Log** methods; keep **Trigger** off to focus the contrast.
3. Set **Polling interval** to 350–500ms to exaggerate lag.
4. Start the run and expand the **Event Log**.
5. Highlight that deletes may be invisible in polling until the next sweep, while the log method emits the delete instantly.
6. Toggle **Soft deletes** on and off to show how tombstones appear vs. disappear downstream.

**Talking points**
- Why polling needs either tombstones or periodic full refreshes to avoid ghost rows.
- How log-based capture handles deletes even when the source row is already gone.
- How downstream consumers can mis-order events if the poll cadence is too wide.

## Demo 2 – Schema evolution with backfill expectations

1. Load **Schema Evolution**.
2. Run once with **Trigger** and **Log** both enabled to establish a baseline.
3. In the **Schema** panel, add a column (e.g., `loyalty_notes` as `string`) and choose **Backfill existing rows**.
4. Rerun and pause mid-stream to observe:
   - **Log** emits the schema change immediately, followed by backfilled values.
   - **Trigger** may lag until the next trigger cycle but preserves column order and defaults.
5. Flip **Backfill existing rows** off and rerun to show how nulls appear downstream and how consumers should guard for missing columns.
6. Use the **Lane diff overlay** to pinpoint any missing updates caused by backfill choices.

**Talking points**
- Schema propagation order: DDL first, then DML, and why some sinks need schema compatibility mode.
- Backfill trade-offs: immediate correctness vs. bursty load on the source.
- Why feature flags (`ff_trigger_mode`, `ff_walkthrough`) stay enabled for this flow.

## Demo 3 – Orders + items with apply-on-commit

1. Load **Orders + Items Transactions**.
2. Enable **Trigger** and **Log**; keep **Polling** optional to show worst-case lag.
3. Turn **Apply on commit** **on** so downstream apply waits for all operations in a transaction.
4. Run and open the **Lane checks summary** to confirm both methods stay aligned with no missing rows.
5. Turn **Apply on commit** **off** and rerun to show transient gaps where orders appear without items (or vice versa).
6. Use **Load in workspace** to push the scenario back to the main playground and experiment with additional updates.

**Talking points**
- Multi-entity writes and why ordering guarantees matter for referential integrity.
- How log vs. trigger capture handle transaction grouping and why apply-on-commit is safer for downstream joins.
- Interpreting lag overlays to spot the precise point where ordering breaks.

## Demo 4 – Outbox relay vs. raw change feed

1. Load **Outbox Relay**.
2. Enable all three methods (**Polling**, **Trigger**, **Log**) to mirror typical hybrid deployments (table-level change feed plus application-managed outbox rows).
3. Start the run and pin the **Event Log** filter to `outbox_events` to watch the business events the app emits.
4. Toggle **Drop snapshot rows** and **Dedupe on PK** in the Event Log toolbar to show how downstream services can avoid replaying the same outbox event even if the change feed replays historical rows.
5. Flip **Trigger** off mid-run to illustrate what happens when the app stops writing to the outbox while base table updates continue through the log stream.
6. Pause and use the **Lane diff overlay** to show that base table changes still arrive via log/polling, while outbox rows can be used to drive idempotent notifications keyed by `event_key`.

**Talking points**
- Outbox pattern protects business event schemas from breaking changes in the source tables.
- Why per-event keys (`event_key`) and monotonic IDs (`EVT-221-*`) make dedupe + ordering straightforward downstream.
- How to combine raw change feed (for data lake) with outbox events (for fan-out notifications) without double-processing.

## Demo 5 – Retention and GDPR erasure

1. Load **Retention & Erasure** from the gallery.
2. Enable **Polling** and **Log**; toggle **soft deletes** on so tombstones stay visible.
3. Start the run and open the **Event Log**, filtering to `customers` and `marketing_preferences` to see deletes and masking steps.
4. Toggle **Drop snapshot rows** and **Dedupe on PK** to illustrate how downstream systems avoid replaying masked history.
5. Pause when `C-300` is deleted to highlight the hard delete, then resume to watch `C-301` transition through `retained_for_legal` before being erased.
6. Flip **Apply on commit** on/off to show how grouped deletes + audit rows stay atomic in the sink.

**Talking points**
- Tombstones vs. masking: why masking `email` before delete keeps privacy obligations even if polling lags.
- How retention windows/holds mean log streams keep emitting events even when soft-deleted rows linger for compliance.
- Why downstream dedupe + drop-snapshot controls matter when replaying erasure workflows from change feeds.

## Demo 6 – Snapshot replay and idempotent apply

1. Load **Snapshot Replay** from the gallery.
2. Enable **Polling** and **Log** lanes to compare replay behaviour; leave **Trigger** off for clarity.
3. Run once with default Event Log settings to show how replayed snapshot rows (`LED-100`) surface as duplicate inserts when offsets reset.
4. Toggle **Drop snapshot rows** and **Dedupe on PK** in the Event Log toolbar, then rerun to demonstrate how downstream apply stays idempotent even if the source re-seeds.
5. Use **Load in workspace** and tweak **Polling interval** to simulate long-running catch-ups; open **Lane diff overlay** to see where duplicate rows would have landed without dedupe.

**Talking points**
- Why offset resets or full refreshes often replay historical rows even when downstream already applied them.
- How PK-based dedupe and drop-snapshot controls prevent data drift when reprocessing a feed.
- When to combine snapshot drops with **Apply on commit** to keep multi-row ledger updates consistent across sinks.

## Tips for live sessions

- Keep the **Metrics dashboard** open to call out backlog and lag percentiles per method.
- Use the **NDJSON export** from the Event Log when attendees want to inspect raw change events.
- If Playwright or harness tests recently failed, rerun `npm run check:bundles` to confirm local assets match sources before presenting.
- Share the **Scenario matrix** from the README when handing off self-serve exploration.
