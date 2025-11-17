# Developer Onboarding

## Install & bootstrap
```bash
npm install
```

## Architecture crash course

The project uses a shared `src/` workspace that is consumed by both the simulator (data generation + adapters) and the comparator web shell. The top-level layout mirrors the implementation plan in `docs/IMPLEMENTATION_PLAN.md`:

```
src/
  domain/        # shared record + schema types
  engine/        # event bus, scheduler, metrics, CDC controller
  modes/         # log-, query-, and trigger-based adapters
  features/      # presets, scripted scenarios, normalisers
  ui/            # reusable UI primitives (event log, metrics widgets, walkthrough)
  test/          # vitest suites covering adapters + UI
```

### Event flow overview

```text
Source ops ─▶ Mode adapter (log/query/trigger)
             │      │
             │      └─▶ Scheduler ticks (polling, extractor cadences)
             ▼
        CDCController ──▶ EventBus ──▶ MetricsStore
             │                 │             │
             │                 │             └─▶ UI widgets (metrics strip, dashboard, lane overlay)
             │                 └─▶ Consumers (React comparator, NDJSON export)
             └─▶ Feature hooks (pause/resume, apply-on-commit, schema demo)
```

1. **Adapters** translate `SourceOp` mutations into CDC events and hand them to the shared `CDCController` via its `emit` callback.
2. **CDCController** enriches events with transport metadata, pushes them into the `EventBus`, and updates the `MetricsStore`.
3. **EventBus** tracks per-topic offsets/backlog. The comparator drains it through pause/resume aware consumers, while export flows reuse the same stream.
4. **MetricsStore** exposes produced/consumed counts, lag percentiles, missed delete counters, and snapshot row tallies that power UI components.
5. **Feature hooks** (schema walkthrough, apply-on-commit, presets) hang off the controller/runtime layer so both the simulator and harness stay in sync.

Refer to [`docs/feature-flags.md`](./feature-flags.md) for the current owner + rollout matrix when you need to toggle experiences locally—no demo prep required.

All CDC modes publish into a shared `EventBus` (`src/engine/eventBus.ts`). The bus assigns offsets per topic and feeds the metrics store so UI components (event log, metrics strip, lane diff overlay) can render consistent backlog/lag views. When wiring new behaviour make sure:

1. The adapter invokes the provided `emit` callback from `CDCController` instead of publishing directly.
2. Metrics updates (`onProduced`, `onConsumed`, `recordMissedDelete`, `recordWriteAmplification`) stay in sync with adapter semantics.
3. UI consumers derive read models from the bus rather than bespoke stores—see `web/App.tsx` for integration examples.

## Planning & status
- Anchor every change against the implementation plan (currently **v1** per `docs/IMPLEMENTATION_PLAN.md`).
- Before you start new work, skim the implementation plan’s [changelog](IMPLEMENTATION_PLAN.md#changelog) to see what shifted since your last sync.
- Track active priorities and delivery gates via `docs/next-steps.md` and the feature-flag matrix in `docs/launch-readiness.md#feature-flag-matrix`.

## Common workflows
- Review the day-to-day checklist in `../development.md` for the branching + PR process.
- Run the React comparator + simulator side-by-side: `npm run dev:all` (spawns `npm run dev:sim` and `npm run dev:web` in parallel).
- Focus on the comparator shell only: `npm run dev:web` (ensure you have a fresh `npm run build:sim` first).
- Generate fresh sim bundles before booting the comparator: `npm run build:sim`.
- Property-test the engines: `npm run test:sim`.
- Type-check and unit test the shared engine/ui packages: `npx tsc --noEmit` and `npm run test:unit` (see `/src/test`).
- Smoke the Playwright flows, including the apply-on-commit transaction scenario: `npm run test:e2e`.
- Build artefacts for the playground: `npm run build`.
- Refresh the nightly harness summary (requires a GitHub token with workflow scope): `GITHUB_TOKEN=... npm run harness:history`.

## Comparator debug API
The comparator shell exposes a lightweight debug helper in the browser console for deterministic testing/debugging:

```ts
window.cdcComparatorDebug.getLaneSnapshot("polling"); // deep clone of the current destination rows
window.cdcComparatorDebug.getLaneHistory("trigger"); // recent row counts recorded per lane
window.cdcComparatorDebug.resetHistory(); // clear history before a new scenario run
```

The lane history is capped to the most recent 32 transitions per method and powers the Playwright transaction-drift coverage. Use it when you need to assert on destination state without poking at React internals.

## Component stories
We use [Ladle](https://ladle.dev/) to iterate on UI primitives:
```bash
npm run ladle
```
Stories live under `web/stories/`—add new ones alongside components so copywriters and designers can experiment without running the full shell.

## Harness quickstart
See `docs/harness-guide.md` for Make targets that bring up Postgres, Debezium, and the verifier. Useful for CDC end-to-end debugging.
