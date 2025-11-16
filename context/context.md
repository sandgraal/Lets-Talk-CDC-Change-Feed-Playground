# Repository Context

## project_summary
- Zero-dependency CDC playground served straight from `index.html`; advanced comparator UI is bundled React app loaded via `assets/ui-shell-loader.js`.
- Simulator + comparator share generated bundles under `assets/generated/` with supporting loaders in `assets/` and authored sources in `src/` + `web/`.
- Harness tooling (`harness/`, `sim/`, `scripts/`) supports snapshotting curated scenarios, nightly verification, and CI smoke.

## dependency_graph
- **Web UI**: React/Vite app living under `web/` that re-exports shared UI widgets from `src/ui/**` and is compiled into `assets/generated/ui-shell.js`.
- **Simulator**: Core CDC engines + event log components authored under `src/` with build + property test harnesses in `sim/` and `scripts/`.
- **Static shell**: Plain JS/DOM playground under `assets/app.js` orchestrates schema modelling + scenario exports.
- **Tooling**: Playwright config + tests under `tests/e2e`, Vitest/Jest configs in repo root, Harness makefiles in `harness/`.

## commands_map
- `npm run build:sim` → compile simulator engines into `assets/generated/sim-bundle.js`.
- `npm run build:web` → build comparator React shell for `assets/generated/ui-shell.js`.
- `npm run build` → run both builds.
- `npm run test:sim` → property/invariant tests (requires fresh sim bundle).
- `npm run test:unit` → unit suite across adapters + UI widgets.
- `npm run test:e2e` → Playwright smoke.
- `npm run test:harness-report` → Harness HTML snapshot.
- `npm run ci:preflight` → sim/web builds + property tests + Playwright + snapshots.
- `npm run ci:harness` → Harness nightly smoke.

## key_paths_by_feature
- **Comparator feature flags + config**: `index.html`, `assets/feature-flags.js`, `docs/feature-flags.md`.
- **Schema walkthrough UI**: `src/ui/components/SchemaWalkthrough.tsx`, consumed inside `web/App.tsx`.
- **Apply-on-commit toggle + transactions**: `web/App.tsx` multi-table lane controls, scenario definitions in `assets/shared-scenarios.js`.
- **E2E specs**: `tests/e2e/*.spec.mjs`, Playwright config in `playwright.config.ts`.

## known_constraints_and_feature_flags
- Feature flags are loaded from `window.cdcFeatureFlags` / `APPWRITE_CFG.featureFlags`; an empty set enables all features by default, but once populated it becomes an allowlist.
- `ff_schema_demo`, `ff_multitable`, `ff_trigger_mode`, `ff_metrics`, and `ff_walkthrough` gate larger comparator surfaces; docs under `docs/feature-flags.md` describe rollout expectations.
- Keep generated bundles untouched unless rebuilding via the documented scripts; property tests depend on the generated simulator bundle.
