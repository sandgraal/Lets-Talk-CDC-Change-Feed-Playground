# CDC Method Comparator Guide

The CDC Method Comparator (`#simShellRoot`) is the React shell that streams the Polling, Trigger, and Log capture engines side by side so you can see ordering, lag, and delete semantics in one place. Use this guide to launch it locally, pick the right knobs, and run demos with data engineers or architects evaluating change feed patterns.

## Prerequisites
- Node 18+ and npm installed locally.
- Bundles generated at least once via `npm run build` (creates `assets/generated/ui-shell.js` and `assets/generated/ui-shell.css`).
- Optional but recommended: run `npm run build:sim` to rebuild simulator engines if you touched any `sim/` sources.

## Launching the comparator
1. Install dependencies: `npm install`.
2. Build the bundles (needed for the React shell): `npm run build`.
3. Open `index.html` in a browser (double-click or `open index.html`).
4. Scroll to the **CDC Method Comparator** section. If you see "Preparing simulator preview…" refresh after the build finishes.

### Development loop
- Use `npm run dev:all` to run sim + web Vite dev servers with live reload. The comparator mounts at `/web` while `index.html` still works for bundle snapshots.
- The comparator persists preferences in localStorage. Use the **Reset comparator** button in the preferences panel to clear state between demos.

## Interface tour
- **Scenario picker**: Choose curated scenarios from `assets/shared-scenarios.js` or load the live workspace feed. Scenario cards surface tags (orders, payments, lag) and highlights to help select the right story.
- **Vendor preset blueprint**: See the end-to-end pipeline (source → capture → transport → sink), an example topic/namespace, and quick docs links for the selected vendor preset so participants know which stack is being modelled.
- **Method toggles**: Enable Polling, Trigger, or Log lanes individually to isolate a capture approach. Polling includes a soft-delete visibility toggle; Trigger exposes trigger overhead; Log exposes binlog/WAL fetch cadence.
- **Event log overlay**: Click **Inspect** on any lane or the lane diff overlays to open the unified event log. Filter by operation type, table, or method to trace divergence.
- **Lane diffs**: Overlays highlight missing/extra/out-of-order operations per method. The summary chips explain where lag or ordering drift appears and tie back to exact events.
- **Metrics dashboard**: Shows produced/consumed counts, backlog, and lag percentiles. Use it to quantify changes when tweaking polling intervals or trigger overhead.
- **Apply-on-commit**: When enabled, downstream apply waits until a transaction’s full batch is present. Use this in multi-table demos to contrast atomic vs. streaming apply.
- **Exports/imports**: Export preferences and the last insight snapshot to a JSON file; import it later to replay the same comparator state.

## Demo recipes
- **Lag and ordering primer (CRUD Basic)**
  - Enable all three methods; leave apply-on-commit off.
  - Slowly step through events and open lane diffs to show how Polling lags behind Trigger/Log and can reorder updates around deletes.
- **Trigger overhead vs. latency (Real-time Payments)**
  - Toggle Trigger on/off while watching the metrics dashboard. Increase **Trigger cadence** to show how overhead impacts tail latency but still preserves ordering.
- **Delete semantics (Retention & Erasure)**
  - Turn on Polling with soft deletes visible and Log without apply-on-commit. Show how Polling surfaces deletes as tombstones only when the record is observed, while Log captures the delete immediately.
- **Schema evolution (Schema Evolution)**
  - Trigger a column add in the scenario controls, then inspect events. Log propagates column changes immediately; Polling sees them after the next snapshot or diff cycle.
- **Snapshot re-seed (Snapshot Replay)**
  - Reset offsets for Polling to simulate a snapshot resume. Use lane diffs to illustrate how dedupe and apply-on-commit avoid double-apply after the snapshot completes.

## Troubleshooting
- Comparator stuck on "Enable the comparator_v2 feature flag": run `npm run build` to regenerate bundles so the shell code is available.
- Event log looks stale after editing scenarios: rerun `npm run build:sim` to rebuild simulator engines, then refresh `index.html`.
- Playwright or browser launch errors when running tests: install browsers locally with `npx playwright install --with-deps` (documented in `docs/development.md`).

## Deep dives
- [CDC Demo Playbook](./cdc-demo-playbook.md) – narrative scripts to deliver during workshops.
- [CDC Lab Recipes](./cdc-lab-recipes.md) – hands-on labs for latency, ordering, schema, and delete semantics.
- [Performance Budgets](./performance-budgets.md) – baseline metrics and guardrails for the comparator shell.
