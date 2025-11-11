# Feature Flag Matrix

This matrix tracks the major feature flags used in the CDC playground, summarising ownership, intent, defaults, and rollout sequencing so we can coordinate our own launches without involving other teams. Outstanding governance work is tracked in [docs/issues/feature-flag-governance.md](./issues/feature-flag-governance.md).

| Flag | Owner | Purpose | Default State | Rollout Plan |
| --- | --- | --- | --- | --- |
| `comparator_v2` | Core duo | Controls release of the refreshed comparator UI with diff overlays and guided experiences. | Cohort-based: enabled for internal accounts first, then beta allowlist, before becoming default-on at GA. | Four-week rollout covering internal dogfood, design partner beta, GA enablement, and post-launch review checkpoints. |
| `ff_crud_fix` | Core duo | Hardens CRUD flows with controlled inputs, single-write semantics, and surfaced error toasts. | Enabled by default via the Appwrite seed list. | Ships as part of the P0 feature bundle alongside Event Log, Event Bus, Pause/Resume, and Query slider workstreams. |
| `ff_event_log` | Core duo | Unlocks the Event Log panel with filters/actions and produced/consumed counters. | Enabled by default via the Appwrite seed list. | Ships in the P0 bundle; remains on once the Event Log meets acceptance criteria. |
| `ff_event_bus` | Core duo | Shows the Event Bus column with backlog and lag metrics sourced from the shared EventBus. | Enabled by default via the Appwrite seed list. | Ships in the P0 bundle to support pause/resume and backlog instrumentation. |
| `ff_pause_resume` | Core duo | Enables pause/resume controls so users can observe backlog growth and draining behaviour. | Enabled by default via the Appwrite seed list. | Ships in the P0 bundle together with Event Bus visibility. |
| `ff_query_slider` | Core duo | Provides the polling interval slider and query-mode lossiness messaging. | Enabled by default via the Appwrite seed list. | Ships in the P0 bundle to highlight query-mode trade-offs. |
| `ff_trigger_mode` | Core duo | Adds the trigger-based CDC adapter with write-amplification modelling. | Disabled by default until the P1 rollout window. | Activates in the P1 wave after the P0 bundle proves stable. |
| `ff_schema_demo` | Core duo | Drives the schema change demo with add/drop column flows and schema version badges. | Disabled by default until the P1 rollout window. | Activates in the P1 wave alongside trigger mode and walkthrough enhancements. |
| `ff_multitable` | Core duo | Exposes multi-table + transactional scenarios with apply-on-commit coordination. | Disabled by default until the P1 rollout window. | Activates in the P1 wave once multi-table flows clear verification. |
| `ff_metrics` | Core duo | Surfaces the metrics dashboard with backlog, lag percentiles, and lane checks telemetry. | Disabled by default until the P1 rollout window. | Activates in the P1 wave after telemetry validation. |
| `ff_walkthrough` | Core duo | Enables the guided tooltips and glossary walkthrough experience. | Disabled by default until the P1 rollout window. | Activates in the P1 wave together with schema demo improvements. |
