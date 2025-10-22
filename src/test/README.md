# CDC Playground Test Suites

This directory houses the unit-level Vitest suites that exercise the simulator engine and UI widgets. Use the map below to find the spec that covers a given subsystem.

## Vitest suites

- `unit/cdcController.test.ts` &mdash; verifies the `CDCController`'s lifecycle handling, topic metrics, and coordination with the in-memory `EventBus`, `Scheduler`, and `MetricsStore` utilities.
- `unit/eventBus.test.ts` &mdash; covers the `EventBus` queue semantics, including offset assignment, FIFO ordering, and reset behaviour per topic or globally.
- `unit/eventLog.test.tsx` &mdash; renders the `EventLog` component to ensure snapshot statistics are surfaced and omitted appropriately.
- `unit/laneDiffOverlay.test.tsx` &mdash; smoke-tests schema drift messaging emitted by the `LaneDiffOverlay` UI overlay.
- `unit/metricsDashboard.test.tsx` &mdash; validates the aggregated metrics dashboard view across comparator lanes, including totals and per-lane change mix summaries.
- `unit/metricsStrip.test.tsx` &mdash; asserts the headline comparator metrics strip shows lag, throughput, delete mix, and status flags.
- `unit/modes.test.ts` &mdash; exercises the log-, trigger-, and query-based adapters to confirm they emit events, schema changes, and metrics in the same way the simulator does.
- `unit/scenarios.test.ts` &mdash; keeps the curated scenario catalogue aligned with the public README matrix.
- `unit/schemaWalkthrough.test.tsx` &mdash; verifies the schema walkthrough coach marks trigger the correct callbacks.

Run all unit suites with:

```bash
npm run test:unit
```

For iterative local work, `npx vitest watch` respects the same configuration declared in `vitest.config.ts`.

## Shared fixtures and helpers

- Global DOM matchers from `@testing-library/jest-dom` are registered via `vitest.setup.ts`. Avoid re-declaring them in individual specs.
- Prefer reusing the in-memory `EventBus`, `Scheduler`, and `MetricsStore` classes from `src/engine/` when building new controller tests so metrics assertions remain consistent.

## Playwright end-to-end specs

Browser-driven smoke tests live alongside other QA tooling under `tests/e2e/`:

- `tests/e2e/comparator.spec.mjs` exercises the full comparator shell, relying on the shared `loadComparator` helper in the file to wait for the UI shell to stabilise and for onboarding state to be seeded before each test.

Execute the suite locally with:

```bash
npm run test:e2e
```

The command wraps `playwright test` and honours the `PLAYWRIGHT_DISABLE=1` guard used in CI to skip browser runs when necessary.
