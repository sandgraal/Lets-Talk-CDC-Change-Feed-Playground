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

All CDC modes publish into a shared `EventBus` (`src/engine/eventBus.ts`). The bus assigns offsets per topic and feeds the metrics store so UI components (event log, metrics strip, lane diff overlay) can render consistent backlog/lag views. When wiring new behaviour make sure:

1. The adapter invokes the provided `emit` callback from `CDCController` instead of publishing directly.
2. Metrics updates (`onProduced`, `onConsumed`, `recordMissedDelete`, `recordWriteAmplification`) stay in sync with adapter semantics.
3. UI consumers derive read models from the bus rather than bespoke stores—see `web/App.tsx` for integration examples.

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

## Component stories
We use [Ladle](https://ladle.dev/) to iterate on UI primitives:
```bash
npm run ladle
```
Stories live under `web/stories/`—add new ones alongside components so copywriters and designers can experiment without running the full shell.

## Harness quickstart
See `docs/harness-guide.md` for Make targets that bring up Postgres, Debezium, and the verifier. Useful for CDC end-to-end debugging.
