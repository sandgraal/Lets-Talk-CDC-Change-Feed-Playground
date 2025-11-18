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
- Ownership for every P0 workstream sits entirely with us; no external assignments or ticket handoffs remain. ✅ Documented in [docs/issues/ops-sync.md](./issues/ops-sync.md).
- UI copy agreed for warning/info badges and pause help text; visual mocks archived for our own reference. ✅
- Test data scenarios scripted (rapid updates, delete between polls) and automated where feasible. ✅ (scenarios in `src/features/scenarios.ts`).

## Tracking
- Progress is tracked directly through our shared commit history and PRs; no separate sprint board is maintained. ✅ See [docs/issues/ops-sync.md](./issues/ops-sync.md).
- Mid-sprint demos are no longer required—there are no external stakeholders. ✅ Decision captured in [docs/issues/ops-sync.md](./issues/ops-sync.md).

## Near-Term Priorities (handoff)
- Flesh out mode adapters with richer telemetry (write amplification, missed deletes) reflected in UI summaries. ✅ Lane checks panel now surfaces diff + lag chips; schema drift chips land in summary.
- ✅ Replace placeholder `src/ui/components/EventLog` with the actual component now that the comparator pulls data from `/src` runtimes.
- Add unit tests around `CDCController`, `EventBus`, and each mode adapter (see `src/test/README.md`). ✅ Vitest suite now covers adapters, controller, metrics, and lane overlays; continue expanding toward multi-table scenarios.
- ✅ Add Storybook visual regression notes for lane checks / diff overlay so QA knows which Ladle stories to reference. See `docs/enablement/lane-diff-visual-regression.md` for the canonical story list and screenshot guidance.
- ✅ Multi-table + transactional demo landed with apply-on-commit toggle; follow-up e2e for transaction drift still on backlog. See [docs/issues/transaction-drift-e2e.md](./issues/transaction-drift-e2e.md).

## Outstanding backlog

### P0 - Critical (Address Immediately)
- [x] Security vulnerability fix (koa dependency) - **COMPLETED**
- [x] Fix harness CI Docker certificate issues - **COMPLETED** (configured npm strict-ssl=false in Dockerfiles)
- [x] Complete `comparator_v2` staged rollout readiness - **COMPLETED** (flag enabled, tests passing, documentation updated)

### P1 - Important (Next Sprint)
- [x] Feature flag activation governance - **COMPLETED** (comprehensive governance plan documented)
- [x] Add transaction drift E2E test ([docs/issues/transaction-drift-e2e.md](./issues/transaction-drift-e2e.md))
- [x] Enable `ff_walkthrough` after content review - **COMPLETED**
- [ ] Enable `ff_trigger_mode` after UI work completion ([docs/issues/trigger-write-amplification.md](./issues/trigger-write-amplification.md))

### P2 - Future Work
- [ ] Appwrite persistence + configuration ([docs/issues/appwrite-persistence.md](./issues/appwrite-persistence.md))
- [ ] Persistent scenarios & shareable experiences ([docs/issues/shareable-experiences.md](./issues/shareable-experiences.md))
