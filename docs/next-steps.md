# Implementation Next Steps

## Sprint Kickoff Focus (P0)
- Stand up the new `/src` module layout (engine, modes, domain, ui, features, test) and add minimal scaffolding exports.
- Implement the core `EventBus`, `CDCController` state machine skeleton, and shared `MetricsStore` interfaces.
- Close the CRUD reliability gaps: controlled form inputs, single-write semantics, and surfaced error toasts.
- Build the Event Log panel with filters/actions and wire the real-time produced/consumed counters.
- Add Pause/Resume for the consumer, backlog + lag metrics, and the Event Bus column visualizing queued offsets.
- Ship the Query mode polling interval slider, lossy-delete banner, and `missedDeletes` metric.

## Enablers & Platform Work
- Add feature flags for P0 scope (`ff_event_bus`, `ff_pause_resume`, `ff_query_slider`, `ff_crud_fix`, `ff_event_log`).
- Refresh unit/e2e test suites to cover EventBus ordering, CRUD flows, pause/resume backlog, and query-mode lossiness.
- Update developer docs (onboarding, harness guide) with the new architecture map and event bus workflow.
- Prepare initial metrics telemetry hooks (in-memory only) and dashboard UI shell.

## Definition of Ready
- Implementation plan captured at `docs/IMPLEMENTATION_PLAN.md` and linked in team tooling.
- Owners identified for each P0 workstream; story tickets created with acceptance criteria above.
- UI copy agreed for warning/info badges and pause help text; visual mocks shared with design partners.
- Test data scenarios scripted (rapid updates, delete between polls) and automated where feasible.

## Tracking
- Capture progress in the sprint board using the P0 feature flags as epics.
- Schedule mid-sprint review to demo Event Log, Pause/Resume, and Query mode warning behaviors.
