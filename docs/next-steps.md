# Implementation Next Steps

> ℹ️ **Release sync:** The shipped scope for v1 is tracked in [`docs/IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md#current-release-scope-v1-0-0). Update both documents together when statuses change.

## Sprint Kickoff Focus (P0)
- Stand up the new `/src` module layout (engine, modes, domain, ui, features, test) and add minimal scaffolding exports. ✅
- Implement the core `EventBus`, `CDCController` state machine skeleton, and shared `MetricsStore` interfaces. ✅
- Close the CRUD reliability gaps: controlled form inputs, single-write semantics, and surfaced error toasts. ✅ (gated by feature flag `ff_crud_fix`).
- Build the Event Log panel with filters/actions and wire the real-time produced/consumed counters. ✅ (gated via `ff_event_log`).
- Add Pause/Resume for the consumer, backlog + lag metrics, and the Event Bus column visualizing queued offsets. ✅ (`ff_event_bus`, `ff_pause_resume`).
- Ship the Query mode polling interval slider, lossy-delete banner, and `missedDeletes` metric. ✅ (`ff_query_slider`).

## Enablers & Platform Work
- Add feature flags for P0 scope (`ff_event_bus`, `ff_pause_resume`, `ff_query_slider`, `ff_crud_fix`, `ff_event_log`). ✅ incorporated in `index.html`.
- Refresh unit/e2e test suites to cover EventBus ordering, CRUD flows, pause/resume backlog, and query-mode lossiness. ✅ Unit coverage now exists for `CDCController`, adapters, metrics widgets, and lane diff schema drift; Playwright exercises the schema walkthrough end-to-end.
- Update developer docs (onboarding, harness guide) with the new architecture map and event bus workflow. ✅ Added event-flow overview and harness mapping notes.
- Prepare initial metrics telemetry hooks (in-memory only) and dashboard UI shell. ✅ Dashboard surfaces per-lane metrics with schema walkthrough controls in place.
- Harden the high-volume generator + replay tooling. ✅ Extracted generator runtime into a tested shared module powering the comparator burst controls and verified workspace replay wiring.

## Definition of Ready
- Implementation plan captured at `docs/IMPLEMENTATION_PLAN.md` and linked in team tooling. ✅
- Owners identified for each P0 workstream; story tickets created with acceptance criteria above. 🔄 Confirm assignment.
- UI copy agreed for warning/info badges and pause help text; visual mocks shared with design partners. ✅
- Test data scenarios scripted (rapid updates, delete between polls) and automated where feasible. ✅ (scenarios in `src/features/scenarios.ts`).

## Tracking
- Capture progress in the sprint board using the P0 feature flags as epics. 🔄 Update board to reflect shipped flags.
- Schedule mid-sprint review to demo Event Log, Pause/Resume, and Query mode warning behaviors. 🔄

## Near-Term Priorities (handoff)
- Flesh out mode adapters with richer telemetry (write amplification, missed deletes) reflected in UI summaries. ✅ Lane checks panel now surfaces diff + lag chips; schema drift chips land in summary.
- ✅ Replace placeholder `src/ui/components/EventLog` with the actual component now that the comparator pulls data from `/src` runtimes.
- Add unit tests around `CDCController`, `EventBus`, and each mode adapter (see `src/test/README.md`). ✅ Vitest suite now covers adapters, controller, metrics, and lane overlays; continue expanding toward multi-table scenarios.
- Todo: add Storybook visual regression notes for lane checks / diff overlay to keep UI states in sync with docs.
- ✅ Multi-table + transactional demo landed with apply-on-commit toggle; follow-up e2e for transaction drift still on backlog.
