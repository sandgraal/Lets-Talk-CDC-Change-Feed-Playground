# Feature Flag Matrix

This matrix tracks the major feature flags used in the CDC playground, summarising ownership, intent, defaults, and rollout sequencing so teams can coordinate launches and support.

| Flag | Owner | Purpose | Default State | Rollout Plan |
| --- | --- | --- | --- | --- |
| `comparator_v2` | Eng Enablement | Controls release of the refreshed comparator UI with diff overlays and guided experiences. | Cohort-based: enabled for internal accounts first, then beta allowlist, before becoming default-on at GA. | Four-week rollout covering internal dogfood, design partner beta, GA enablement, and post-launch review checkpoints. |
| `ff_crud_fix` | Comparator Engineering | Hardens CRUD flows with controlled inputs, single-write semantics, and surfaced error toasts. | Enabled by default via the Appwrite seed list. | Ships as part of the P0 feature bundle alongside Event Log, Event Bus, Pause/Resume, and Query slider workstreams. |
| `ff_event_log` | Comparator Engineering | Unlocks the Event Log panel with filters, actions, and produced/consumed counters. | Enabled by default via the Appwrite seed list. | Ships in the P0 bundle; remains on once the Event Log meets acceptance criteria. |
| `ff_event_bus` | Comparator Engineering | Shows the Event Bus column with backlog and lag metrics sourced from the shared EventBus. | Enabled by default via the Appwrite seed list. | Ships in the P0 bundle to support pause/resume and backlog instrumentation. |
| `ff_pause_resume` | Comparator Engineering | Enables pause/resume controls so users can observe backlog growth and draining behaviour. | Enabled by default via the Appwrite seed list. | Ships in the P0 bundle together with Event Bus visibility. |
| `ff_query_slider` | Comparator Engineering | Provides the polling interval slider and query-mode lossiness messaging. | Enabled by default via the Appwrite seed list. | Ships in the P0 bundle to highlight query-mode trade-offs. |
| `ff_trigger_mode` | Comparator Engineering | Adds the trigger-based CDC adapter with write-amplification modelling. | Disabled by default until the P1 rollout window. | Activates in the P1 wave after the P0 bundle proves stable. |
| `ff_schema_demo` | Comparator Engineering | Drives the schema change demo with add/drop column flows and schema version badges. | Disabled by default until the P1 rollout window. | Activates in the P1 wave alongside trigger mode and walkthrough enhancements. |
| `ff_multitable` | Comparator Engineering | Exposes multi-table + transactional scenarios with apply-on-commit coordination. | Disabled by default until the P1 rollout window. | Activates in the P1 wave once multi-table flows clear verification. |
| `ff_metrics` | Comparator Engineering | Surfaces the metrics dashboard with backlog, lag percentiles, and lane checks telemetry. | Disabled by default until the P1 rollout window. | Activates in the P1 wave after telemetry validation. |
| `ff_walkthrough` | Comparator Engineering | Enables the guided tooltips and glossary walkthrough experience. | Disabled by default until the P1 rollout window. | Activates in the P1 wave together with schema demo improvements. |

