# Let's Talk CDC - Implementation Plan

Status: v1

## Goals (blunt + prioritized)
- **P0**: Fix CRUD reliability, add **Event Log**, add **Pause/Resume**, add **Polling Interval** control, and **make Query-based limitations explicit**.
- **P0**: Introduce **Event Bus** abstraction (to model Kafka/topic + offsets).
- **P1**: Add **Trigger-based CDC** mode; **Schema change** demo; **Multi-table + transactions**.
- **P1**: **Vendor presets** (labeling + terminology), **Metrics & Lag** dashboard, **Guided tooltips**.
- **P2**: **High-volume generator**, **Replay**, **Download trace**, **Second consumer** (fan-out).

---

## Architecture Changes

### New module layout
```
/src
  /engine
    eventBus.ts      # topic/partition/offset simulation
    stateMachine.ts  # CDC lifecycle, transitions, pause/resume, snapshot phases
    scheduler.ts     # timers for polling + paced delivery
    metrics.ts       # lag, throughput, missed events, write amplification
  /modes
    logBased.ts      # initial snapshot + log tail
    queryBased.ts    # polling; intentionally lossy on delete/intermediate updates
    triggerBased.ts  # NEW: writes to change_table + overhead counters
  /domain
    types.ts         # Record, Event, Txn, Schema, Table, CDCMode
    storage.ts       # in-memory + Appwrite backing (optional)
  /ui
    components/*     # EventLog, Controls, StatusIndicators, Tables, Metrics
    glossary.ts      # mini inline glossary
    tooltips.ts      # copy for guided hints
  /features
    presets.ts       # vendor presets (labels/icons/text)
    scenarios.ts     # scripted demos: multi-update, delete, multi-table transaction
  /test
    unit/*           # core engine tests (to add)
    e2e/*            # cypress/playwright flows

pgsql
```

### Core data types (TypeScript)
```ts
// /src/domain/types.ts
export type CDCMode = 'LOG_BASED' | 'QUERY_BASED' | 'TRIGGER_BASED';

export type Schema = {
  name: string;
  columns: { name: string; type: 'string'|'number'|'bool'|'timestamp'; nullable?: boolean }[];
  version: number;
};

export type Row = { id: string; [k: string]: unknown; __ts?: number };

export type ChangeKind = 'INSERT' | 'UPDATE' | 'DELETE' | 'SCHEMA_ADD_COL' | 'SCHEMA_DROP_COL';

export type Event = {
  id: string;                 // uuid
  kind: ChangeKind;
  table: string;
  before?: Row;               // null for inserts
  after?: Row;                // null for deletes
  txnId?: string;
  commitTs: number;
  schemaVersion: number;
  // transport metadata
  topic: string; partition: number; offset?: number;
};

export type Transaction = {
  id: string;
  changes: Omit<Event,'id'|'topic'|'partition'|'offset'>[];
  commitTs: number;
};

export type Metrics = {
  produced: number;
  consumed: number;
  backlog: number;
  lagMsP50: number; lagMsP95: number;
  missedDeletes: number;         // QUERY mode only
  writeAmplification: number;    // TRIGGER mode
  snapshotRows: number;
  errors: number;
};
```

### Event Bus abstraction (simulates Kafka)
`src/engine/eventBus.ts` publishes events with offsets, supports per-topic resets, and backs the shared backlog/lag metrics powering the comparator UI.

### CDC state machine (lifecycle)
`src/engine/stateMachine.ts` coordinates snapshot/tailing workflows through pluggable adapters. `emit` returns enriched bus events so downstream consumers (React UI, metrics) share a consistent transport.

## Feature Specs & Steps

1. **CRUD reliability fix (P0)**
   - Replace any uncontrolled form edits with controlled inputs.
   - Ensure update flow: edit -> local optimistic update -> source store write -> change capture hook -> emit event.
   - Add toast/error surfacing for failed writes.
   - Acceptance: edit/save always updates Source table + generates exactly 1 UPDATE event (LOG/QUERY/TRIGGER as applicable). No duplicate events on double clicks.

2. **Event Log panel (P0)**
   - New component `/src/ui/components/EventLog.tsx` with stream list: offset, ts, kind, table, key(id), before/after diff.
   - Filters: table, kind, txnId. Actions: Clear, Download JSON, Copy single event.
   - Wire metrics: produced/consumed counters update in real time.
   - Acceptance: every produced event appears in log with stable ordering by offset. Download yields valid newline-delimited JSON.

3. **Pause/Resume + Backlog (P0)**
   - UI control on consumer side: Pause Apply. When paused, consumer stops draining; backlog grows in EventBus.
   - Metrics shows backlog, lagMsP50/P95.
   - Acceptance: pausing does not stop production; backlog increases. Resuming drains in-order; destination converges to source (LOG/TRIGGER), query mode remains best-effort.

4. **Polling interval control (QUERY) (P0)**
   - Slider: 0.5s-10s. Scheduler ticks trigger a diff scan.
   - Deliberately do NOT emit DELETE events; only last known state on UPDATE to demonstrate lossiness.
   - Visual hint: small clock icon + "polling every Xs".
   - Acceptance: rapid multi-updates collapse into single UPDATE. Deletes between polls are missed; metrics `missedDeletes` increments; banner explains why.

5. **Event Bus in the UI (P0)**
   - ✅ Middle column "Event Bus (topic: cdc.table)" wired via shared EventBus.
   - Acceptance: pausing the consumer now shows backlog/lag growth per lane.

6. **Trigger-based CDC mode (P1)**
   - Adapter skeleton implemented; emits events with configurable trigger overhead and increments write amplification metric.
   - Next: surface write amplification in UI and integrate into guided walkthrough.

7. **Schema change demo (P1)**
   - ✅ Buttons: Add Column, Drop Column on Source.
   - ✅ LOG/TRIGGER: include `schemaVersion` on events; Destination applies compatible changes. Lane diff overlay highlights schema drift when destinations lag.
   - QUERY: on Add Column, show partial captures (new col defaults until next poll).
   - Acceptance: UI badges show schema vN -> vN+1; destination eventually aligns (LOG/TRIGGER). Playwright scenario covers walkthrough and destination snapshot behaviour; follow-up needed for QUERY drift messaging.

8. **Multi-table + transactions (P1)**
   - ✅ Adapters emit transaction metadata across modes, apply-on-commit toggle keeps multi-table lanes consistent.

9. **Vendor presets (labels only) (P1)**
   - ✅ Presets dropdown: MySQL + Debezium + Kafka; Postgres Logical Decoding + Kafka; SQL Server CDC + ETL; Oracle GoldenGate; MongoDB Change Streams (informational).
   - ✅ Pipeline badges summarise Source → Capture → Transport → Sink terminology with preset-specific tooltips and external docs links.
   - Acceptance: switching presets updates terminology across UI + glossary. (Met – comparator + guided tour mirror copy.)

10. **Metrics & Lag dashboard (P1)**
    - ✅ Metrics plumbing ready (shared `MetricsStore`). Dashboard visualises produced/consumed/backlog and lag percentiles per lane.
    - ✅ Lane “checks” summary surfaces diff overlays (missing/extra/ordering/lag) with quick inspect controls tied to telemetry.

11. **Guided tooltips + glossary (P1)**
    - ✅ One-time walkthrough: Start CDC -> Snapshot -> Tailing. Differences per mode explained inline, now aligned with preset copy.
    - ✅ Hover terms: "transaction log", "polling", "tombstone", "offset", "backlog" (centralised in shared tooltip copy).
    - Acceptance: tooltips can be toggled off; stored in localStorage.

12. **High-volume generator + replay (optional P2)**
   - Generator: N changes/sec, burst mode. Consumer throttle knob: max events/second.
   - Replay: reset destination, replay last captured trace.
   - Acceptance: users can create artificial lag and watch recovery.
   - 🔄 Consumer throttle control shipped in comparator shell; generator + replay still pending.

## UI Changes (surgical)
- New top bar: Mode | Preset | Start/Stop | Pause/Resume Apply | Polling (QUERY).
- Three columns layout: Source + Controls; Event Bus + Event Log; Destination + Metrics.
- Status strip: state (Idle/Snapshotting/Tailing/Paused), Snapshot progress, Errors.
- Mobile: stack columns vertically; hide EventLog by default on small screens.

## Scenarios (scripted buttons)
- Rapid updates (QUERY trap): update same row 5x within 1s.
- Delete between polls (QUERY trap): insert -> delete; show `missedDeletes++`.
- Txn inconsistency: Orders+Items with naive apply vs commit-batch apply.
- Schema add mid-stream: add column `status`, update few rows.

## Copy: user-facing strings (keep blunt)
- QUERY warning badge: "Polling is lossy: deletes and intermediate updates can be missed."
- TRIGGER info: "Immediate capture; added write per row (overhead)."
- LOG info: "Snapshot first; then tail transaction log (complete change history)."
- Pause help: "Apply paused: events queue on the bus; backlog and lag will grow."

## Telemetry (local-only by default)
- Counters: produced, consumed, backlog, `missedDeletes`, `writeAmplification`, `snapshotRows`, errors.
- Lag: produce time = `event.commitTs`; consume time = when applied; lag = now - commitTs; maintain rolling p50/p95 (simple reservoir).
- Developer toggle to emit these to Appwrite/console in dev.
- Comparator CTA emits `comparator.overlay.inspect` when lane checks drill into diff details (mirrors `comparator.diff.opened`).

## Testing
- **Unit** (`/src/test/unit` – to author):
  - EventBus publish/consume ordering and offset monotonicity.
  - Mode adapters: query-based missed delete counters, trigger-based write amplification, log-based WAL tailing.
  - CDCController pause/resume/stop clearing scheduler.
- **E2E** (`/src/test/e2e`): edit record -> event log parity; query mode rapid updates collapse; delete between polls; pause backlog/resume drain; schema add flows.

## Accessibility
- Keyboard navigation for all controls.
- Live region for status changes.
- Sufficient contrast on badges.

## Performance Guardrails
- Batch log rendering (windowed list). Cap EventLog to last N=2,000 events with "Load more".
- Avoid heavy animations; prefer CSS transforms.
- Provide "Reset simulation" to clear memory.

## Security/Privacy
- No PII; generated sample data only.
- If Appwrite used, isolate per session or wipe on reset.
- Note: "Demo only; not production CDC."

## Rollout Plan
- Feature flags: `ff_event_bus`, `ff_pause_resume`, `ff_query_slider`, `ff_trigger_mode`, `ff_schema_demo`, `ff_multitable`, `ff_metrics`, `ff_walkthrough`.
- Release order: P0 bundle (event bus, pause/resume, query slider, CRUD fix, EventLog) -> P1 (trigger mode, schema demo, multitable, metrics, walkthrough, presets) -> P2 (generator, replay, second consumer).
- Track owners, default states, and activation sequencing in [`docs/feature-flags.md`](./feature-flags.md).
- Add `CHANGELOG.md`.

## Acceptance Criteria (summarized)
- P0 live = backlog/lag visible; pause/resume functional; query-mode lossiness demonstrated.
- P1 live = three modes comparable; schema evolution and txn consistency toggles working.
- Metrics credible; EventLog usable/exportable.

## Minimal Code Hooks (pseudocode)
```ts
function writeSource(table: string, op: ChangeKind, rowBefore?: Row, rowAfter?: Row) {
  sourceStore.apply(table, op, rowBefore, rowAfter);

  switch (mode) {
    case 'LOG_BASED':
      logTail.enqueue({op, table, before: rowBefore, after: rowAfter});
      break;
    case 'QUERY_BASED':
      break;
    case 'TRIGGER_BASED':
      changeTable.append({op, table, before: rowBefore, after: rowAfter});
      metrics.writeAmplification++;
      break;
  }
}
```

```ts
scheduler.every(pollIntervalMs, () => {
  const diffs = diffSinceLastSnapshot(sourceStore, destinationStore);
  const events = diffs
    .filter(d => d.kind !== 'DELETE')
    .map(d => toEvent(d));
  bus.publish(topicFor(d.table), events);
  metrics.produced += events.length;
});
```

```ts
function drain(topic: string, applyMode: 'NAIVE'|'ON_TXN_BOUNDARY') {
  if (consumerPaused) return;
  const batch = bus.consume(topic, MAX_PER_TICK);
  if (!batch.length) return;

  if (applyMode === 'NAIVE') {
    batch.forEach(evt => applyEvent(evt));
  } else {
    groupBy(batch, 'txnId').forEach(g => g.forEach(evt => applyEvent(evt)));
  }

  metrics.consumed += batch.length;
  metrics.backlog = bus.size(topic);
  metrics.observeLag(batch.map(e => Date.now() - e.commitTs));
}
```

### Vendor Presets (labels only)
```ts
export const PRESETS = {
  MYSQL_DEBEZIUM: {
    logLabel: 'MySQL binlog',
    busLabel: 'Kafka topic',
    topicFormat: (t:string) => `db.${t}`,
    docsHint: 'Snapshot then binlog tail via Debezium.'
  },
  POSTGRES_LOGICAL: { /* ... */ },
  SQLSERVER_CDC: { /* ... */ },
  ORACLE_GG: { /* ... */ },
  MONGODB_STREAMS: { /* ... */ }
};
```

### Copywriting for Tooltips (examples)
- Snapshot: "Reads existing rows to bootstrap destination."
- Tail: "Streams committed row-level changes from the log."
- Polling: "Periodically scans for changed rows. Can miss deletes/intermediate states."
- Backlog: "Events waiting in the bus to be applied."
- Lag: "Time between commit and apply at destination."

## Dev Notes
- Prefer pure in-memory simulation; store only for page refresh continuity.
- Gate P1/P2 with flags to ship value early.
- Keep limitations explicit; this is a teaching tool.

## Open Risks & Mitigations
- Users misread QUERY as reliable -> prominent warning + scenarios proving loss.
- UI overwhelm under burst -> windowed list + metrics, not animations.
- State drift bugs -> strong unit tests; deterministic IDs.
- Mobile UX -> stack columns vertically; hide EventLog by default.

## Done = Shippable when
- CRUD stable; clear errors.
- EventBus + EventLog + Pause/Resume solid.
- Query mode demonstrably lossy with scenarios.
- Basic glossary + tooltips shipped.
- Tests green; CI runs unit + e2e headless.
