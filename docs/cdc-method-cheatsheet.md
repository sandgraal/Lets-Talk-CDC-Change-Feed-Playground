# CDC Method Cheat Sheet

Use this page as a quick reference when deciding which capture pattern to demonstrate in the playground or comparator. Each method includes a mental model, strengths, gotchas, and demo tips tailored for data engineers and architects.

## Polling
- **Ideal for:** Legacy databases or read-only replicas without log access.
- **How it works:** Periodically query the source table with a high-water mark (timestamp or incrementing key) to pull new or updated rows.
- **Strengths:**
  - Low operational risk; no database configuration changes required.
  - Easy to prototype in the playground; set `poll_interval_ms` to visualize lag.
  - Works even when binary logs are disabled or unavailable.
- **Gotchas:**
  - Higher latency under bursty writes; gaps between polls can hide rapid updates.
  - Deletes are hard to spot unless soft-delete flags exist or tombstones are emitted.
  - Backfills can overload the source if intervals are too aggressive.
- **Demo tips:**
  - Start from the **CRUD Basic** or **Omnichannel Orders** scenarios, set a slow poll interval, and issue back-to-back updates to highlight lag and missing deletes.
  - Toggle soft-delete visibility to show how downstream systems react when deletes are invisible to polling.

## Triggers (Change Tables)
- **Ideal for:** Teams who can add lightweight triggers or change tables without relying on WAL/binlog access.
- **How it works:** Database triggers capture row-level operations into an audit/change table; a downstream process drains that table to emit CDC events.
- **Strengths:**
  - Precise row-level change capture with delete visibility baked in.
  - Can include rich business context (actor IDs, reason codes) in the change table schema.
  - Works even when logs rotate quickly or are inaccessible.
- **Gotchas:**
  - Adds write-path overhead; poorly written triggers can degrade OLTP performance.
  - Requires schema management for the change table and trigger code during upgrades.
  - Ordering across tables is not guaranteed unless you include transaction metadata.
- **Demo tips:**
  - Use the **Real-time Payments** scenario and enable the trigger method in the comparator to show minimal lag but clear write overhead.
  - Highlight the `apply_on_commit` toggle to demonstrate how triggers capture multi-row transactions and how downstream apply can stay atomic.

## Log-based (WAL/Binlog)
- **Ideal for:** Production-grade pipelines where low latency and strong ordering matter.
- **How it works:** Tail the database write-ahead log or binlog to stream inserts, updates, and deletes with transaction boundaries.
- **Strengths:**
  - Lowest capture latency with commit-ordering preserved.
  - No write-path overhead on the source tables.
  - Captures schema changes (add/drop columns) when configured correctly.
- **Gotchas:**
  - Requires log access and retention tuning; log rotation can break readers.
  - Schema drift needs careful handling to avoid deserialization failures.
  - Initial snapshots must be coordinated with log positions to avoid duplicate or missing events.
- **Demo tips:**
  - Pair the **Schema Evolution** or **Snapshot ➜ Stream Handoff** scenarios with log capture to show column additions flowing through immediately.
  - Stress-test ordering by toggling the **Burst Updates** scenario and comparing lag overlays between log and polling.

## Outbox
- **Ideal for:** Event-driven architectures where business events must be curated and idempotent.
- **How it works:** Application writes domain events into an outbox table within the same transaction as the source table mutation; a relay publishes those events to downstream transports.
- **Strengths:**
  - Full control over event shape, routing keys, and idempotency tokens.
  - Transactional with source writes, preventing double-publish or lost events.
  - Decouples change capture from internal schema details.
- **Gotchas:**
  - Requires application changes and careful retry/deduplication logic in the relay.
  - Outbox growth must be managed (TTL or vacuum); otherwise drains fall behind.
  - Consistency between outbox and source tables depends on reading both within the same transaction.
- **Demo tips:**
  - Load the **Outbox Relay** scenario and enable log + outbox side by side in the comparator to illustrate business-event ordering vs. raw row changes.
  - Show how the **Snapshot ➜ Stream Handoff** scenario behaves when the outbox feeds a downstream service that expects strict idempotency keys.

## Quick Selection Guide
Use this decision helper during workshops or live demos:

- **Need lowest lag and strict ordering?** Choose **Log-based** and demonstrate transaction boundaries with `apply_on_commit` enabled.
- **No log access but can add database code?** Choose **Triggers** to keep delete visibility intact and attach business context.
- **Running on a replica or constrained environment?** Start with **Polling** and tune intervals; call out delete limitations.
- **Emitting business events to multiple sinks?** Use **Outbox** to craft domain events and dedupe downstream with idempotency keys.
- **Unsure?** Start with **Polling** for safety, then graduate to **Log-based** once access is available.

## How to Use in the Playground
1. Open `index.html` and click **Start guided walkthrough** to seed a schema and rows.
2. Launch the **CDC Method Comparator** (enable the comparator via `comparator_v2` flag if it is disabled) to run Polling, Trigger, and Log side by side.
3. Pick one of the curated scenarios above, then adjust method-specific knobs:
   - **Polling:** `poll_interval_ms`, soft-delete visibility.
   - **Triggers:** trigger overhead sliders; enable `apply_on_commit` for multi-table writes.
   - **Log:** WAL/binlog fetch interval; schema evolution toggles.
4. Use the **Event Log** to filter by method and export NDJSON for downstream replay.
5. Capture a screenshot or export the scenario to share reproducible demos with your team.
