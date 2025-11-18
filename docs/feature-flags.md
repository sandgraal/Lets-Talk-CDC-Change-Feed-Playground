# Feature Flag Matrix

This matrix tracks the major feature flags used in the CDC playground, summarising ownership, intent, defaults, and rollout sequencing so we can coordinate our own launches without involving other teams. Outstanding governance work is tracked in [docs/issues/feature-flag-governance.md](./issues/feature-flag-governance.md).

| Flag              | Owner    | Purpose                                                                                       | Default State                                                                 | Rollout Plan                                                                                                                                       |
| ----------------- | -------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comparator_v2`   | Core duo | Controls release of the refreshed comparator UI with diff overlays and guided experiences.    | **✅ Enabled** in `index.html` as of v1.0.0.                                  | Ready for day-to-day use; rollout readiness tracked in [comparator-v2-rollout.md](./issues/comparator-v2-rollout.md).                              |
| `ff_crud_fix`     | Core duo | Hardens CRUD flows with controlled inputs, single-write semantics, and surfaced error toasts. | Enabled by default in `index.html`.                                           | Ships as part of the P0 feature bundle alongside Event Log, Event Bus, Pause/Resume, and Query slider workstreams.                                 |
| `ff_event_log`    | Core duo | Unlocks the Event Log panel with filters/actions and produced/consumed counters.              | Enabled by default in `index.html`.                                           | Ships in the P0 bundle; remains on once the Event Log meets acceptance criteria.                                                                   |
| `ff_event_bus`    | Core duo | Shows the Event Bus column with backlog and lag metrics sourced from the shared EventBus.     | Enabled by default in `index.html`.                                           | Ships in the P0 bundle to support pause/resume and backlog instrumentation.                                                                        |
| `ff_pause_resume` | Core duo | Enables pause/resume controls so users can observe backlog growth and draining behaviour.     | Enabled by default in `index.html`.                                           | Ships in the P0 bundle together with Event Bus visibility.                                                                                         |
| `ff_query_slider` | Core duo | Provides the polling interval slider and query-mode lossiness messaging.                      | Enabled by default in `index.html`.                                           | Ships in the P0 bundle to highlight query-mode trade-offs.                                                                                         |
| `ff_trigger_mode` | Core duo | Adds the trigger-based CDC adapter with write-amplification modelling.                        | **✅ Enabled** in `index.html` as of v1.0.0.                                  | Ready for day-to-day use; write amplification UI complete per [trigger-write-amplification.md](./issues/trigger-write-amplification.md). |
| `ff_schema_demo`  | Core duo | Drives the schema change demo with add/drop column flows and schema version badges.           | **✅ Enabled** in `index.html` - comparator walkthrough + tests stay in sync. | Remains on now that the scenario smoke is covered; toggle only when debugging schema issues.                                                       |
| `ff_multitable`   | Core duo | Exposes multi-table + transactional scenarios with apply-on-commit coordination.              | **✅ Enabled** in `index.html` - transaction coverage + tutorials stay green. | Keep enabled for day-to-day demos; only disable locally when isolating non-transaction bugs.                                                       |
| `ff_metrics`      | Core duo | Surfaces the metrics dashboard with backlog, lag percentiles, and lane checks telemetry.      | **✅ Enabled** in `index.html` - comparator smoke and tests passing.          | Metrics dashboard functional; continue monitoring telemetry performance.                                                                           |
| `ff_walkthrough`  | Core duo | Enables the guided tooltips and glossary walkthrough experience.                              | **✅ Enabled** in `index.html` as of v1.0.0.                                  | Ready for day-to-day use; guided tour implementation complete with workspace and comparator coverage. |

## Runtime sources and guardrails

- **Manifest:** `assets/feature-flag-manifest.json` is the single source of truth for flag purpose, rollout readiness, and whether each flag should ship in `index.html` by default.
- **Load order:** `assets/feature-flags.js` collects flags from multiple sources and merges them into a single allowlist. Flags are loaded in this order (all sources are combined, not overridden):
  1. `APPWRITE_CFG.featureFlags` (from `index.html` script tag) - Primary defaults
  2. `window.CDC_FEATURE_FLAGS` (from `index.html` script tag) - Fallback defaults
  3. `localStorage` (`cdc_feature_flags_v1` key) - User-persisted overrides
  4. Query parameters (`?flag=...` or `?flags=...,...`) - URL-based overrides (highest priority for testing)
  
  **Important behavior:**
  - All sources are **merged** (combined) into a single Set - flags from all sources are enabled
  - If **any** source provides flags, the resulting set acts as an **allowlist** (only those flags are enabled)
  - If **no** sources provide flags (empty set), **all** features are enabled by default
  - Query params support both `?flag=ff_one&flag=ff_two` (multiple) and `?flags=ff_one,ff_two` (comma-separated)
  
  **Examples:**
  - `?flag=ff_walkthrough` - Enables only `ff_walkthrough` (all other flags disabled)
  - `?flags=ff_walkthrough,ff_trigger_mode` - Enables only those two flags
  - No query params + default `index.html` flags - All default flags from `index.html` are enabled
  - `localStorage` with `["ff_walkthrough"]` + defaults - Merges localStorage flags with defaults
  
- **Drift check:** `npm run lint:flags` asserts `index.html` defaults match the manifest and that no unknown flags are present. Run it locally before PRs; CI runs it via `ci:preflight`.
