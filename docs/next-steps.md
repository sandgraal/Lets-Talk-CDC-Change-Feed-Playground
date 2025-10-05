# Implementation Next Steps

## Sprint Kickoff Focus (P0)
- Stand up the new `/src` module layout (engine, modes, domain, ui, features, test) and add minimal scaffolding exports. ✅
- Implement the core `EventBus`, `CDCController` state machine skeleton, and shared `MetricsStore` interfaces. ✅
- Close the CRUD reliability gaps: controlled form inputs, single-write semantics, and surfaced error toasts. ✅ (gated by feature flag `ff_crud_fix`).
- Build the Event Log panel with filters/actions and wire the real-time produced/consumed counters. ✅ (gated via `ff_event_log`).
- Add Pause/Resume for the consumer, backlog + lag metrics, and the Event Bus column visualizing queued offsets. ✅ (`ff_event_bus`, `ff_pause_resume`).
- Ship the Query mode polling interval slider, lossy-delete banner, and `missedDeletes` metric. ✅ (`ff_query_slider`).

## Enablers & Platform Work
- Add feature flags for P0 scope (`ff_event_bus`, `ff_pause_resume`, `ff_query_slider`, `ff_crud_fix`, `ff_event_log`). ✅ incorporated in `index.html`.
- Refresh unit/e2e test suites to cover EventBus ordering, CRUD flows, pause/resume backlog, and query-mode lossiness. 🔄 Next: author tests in `src/test` targeting adapters + controller.
- Update developer docs (onboarding, harness guide) with the new architecture map and event bus workflow. 🔄 Pending doc refresh.
- Prepare initial metrics telemetry hooks (in-memory only) and dashboard UI shell. 🔄 Metrics store wired, dashboard component still needed.

## Definition of Ready
- Implementation plan captured at `docs/IMPLEMENTATION_PLAN.md` and linked in team tooling. ✅
- Owners identified for each P0 workstream; story tickets created with acceptance criteria above. 🔄 Confirm assignment.
- UI copy agreed for warning/info badges and pause help text; visual mocks shared with design partners. ✅
- Test data scenarios scripted (rapid updates, delete between polls) and automated where feasible. ✅ (scenarios in `src/features/scenarios.ts`).

## Tracking
- Capture progress in the sprint board using the P0 feature flags as epics. 🔄 Update board to reflect shipped flags.
- Schedule mid-sprint review to demo Event Log, Pause/Resume, and Query mode warning behaviors. 🔄

## Near-Term Priorities (handoff)
- Flesh out mode adapters with richer telemetry (write amplification, missed deletes) reflected in UI summaries.
- Replace placeholder `src/ui/components/EventLog` with the actual component now that the comparator pulls data from `/src` runtimes.
- Add unit tests around `CDCController`, `EventBus`, and each mode adapter (see `src/test/README.md`).
- Begin P1 work: Trigger mode walkthrough + schema change demo once adapter metrics solid.
