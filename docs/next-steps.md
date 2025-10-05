# Implementation Next Steps

_Tooling status: `npm run build:sim` → `assets/generated/sim-bundle.js`, `npm run build:web` → `assets/generated/ui-shell.js`. React comparator now renders multi-lane polling/trigger/log preview with tunable method controls._

## Immediate Decisions
- **Guided insight UX** _(Decision: dual-track)_ → Keep React comparator callouts inline, but launch an onboarding spotlight sequence that reuses the same copy. Action: script spotlight steps after lane diff overlays land; file story for tooltip synchronization in the legacy shell.
- **Persisting control state** _(Decision: extend payload)_ → Export/share payloads now include method tuning and active method set. Action: add schema bump to export contracts and schedule consumer migration comms with solutions engineering.
- **State container** _(Decision: stay lightweight)_ → Continue with event emitter + React state for this release. Action: document revisit trigger tied to guided tour scripting; add ADR noting criteria that would push us to Zustand/RxJS.
- **Scenario source of truth** _(Decision: shared module)_ → `assets/shared-scenarios.js` owns canonical templates; React + legacy import from `web/scenarios.ts`. Action: enforce lint rule to block local scenario JSON, and add CI check ensuring generated bundles match shared module.
- **Feature flag posture** _(Decision: launch behind `comparator_v2`)_ → Ship comparator enhancements gated via runtime flag with staged rollout (internal → beta → GA). Action: implement flag hook in shell bootstrap and draft the rollout calendar captured in Launch Readiness.

## Near-Term Build Goals
1. ✅ Persist workspace scenarios + advanced controls into export/import/share flows—exports now carry comparator preferences, analytics, and lane diffs; import/share hydration applies them and snapshots render inside the legacy shell.
2. ✅ Introduce deterministic clock hooks—`window.cdcComparatorClock` and `cdc:comparator-clock` events allow guided tours to play, pause, step, seek, and reset the React comparator on a deterministic timeline.
3. ✅ Implement property-based tests (`npm run test:sim`) covering lag, delete capture, and ordering invariants across Polling/Trigger/Log engines using randomly generated scenarios.
4. ✅ Freeze Scenario JSON schema at `docs/schema/scenario-v2.json`, locking the v2 payload contract and verifying shared templates conform.
5. ✅ Ship lane diff overlays in the comparator so insight callouts surface concrete missing/extra/order issues and lag hotspots per method.
6. ✅ Stand up a preflight suite (`npm run ci:preflight`) mirrored in GitHub Actions to run sim/web builds plus property tests before packaging.

## Harness Track
- ✅ Generator/verifier now consume shared scenarios via `npm run prepare:scenario` (also wired into `harness/Makefile`) and expose PASS/FAIL summaries using the simulator diff engine.
- ✅ Docker compose stack ships with service health checks and curated Make targets (`make up`, `make replay`, `make status`) for deterministic bring-up and debug loops.
- ✅ Verifier serves both JSON and HTML reports at `http://localhost:8089` with live event snapshots and diff tallies.
- ✅ Canonical scenario snapshots live in `harness/fixtures/` with a script (`npm run snapshot:scenarios`) to refresh them when templates change.
- ✅ Documented the rapid debug flow in `docs/harness-guide.md`, covering scenario prep, replay commands, and log inspection.

## Telemetry + Copy
- ✅ Lightweight telemetry client buffers events to localStorage, exposes `window.telemetry.track`, and instruments key comparator/workspace flows.
- Draft copy for “honest callouts” and “when to use which” sections so UI and docs share the canonical text. _(still pending)_
- ✅ Telemetry taxonomy documented in `docs/telemetry-taxonomy.md`, mapping events to activation, funnel-drop, completeness, and collaboration questions.

## Risks to Monitor
- ✅ Dual-stack divergence mitigated via shared scenario module enforcement and telemetry coverage; kill-switch criteria recorded in `docs/risk-register.md`.
- ✅ Harness reliability improved with health checks, generator backoff, and documented Make targets.
- Performance of timeline rendering with >1k events—prototype virtualization approach early. _(open)_
- ✅ Insight copy alignment tracked through telemetry taxonomy + snapshot exports; publishing gate documented in risk register.
- ✅ Schema migration risk mitigated by property-test suite (`npm run test:sim`) executed in CI preflight.

## React Comparator Polish
- Add inline diff gutters for each lane so users can scan insertions/deletions without expanding full event payloads.
- Introduce event search + quick filters (CRUD type, table, CDC marker) to make large traces navigable in workshops.
- Persist comparator panel layout (collapsed JSON vs. timeline) in share links so teammates see the intended view.
- Validate responsive breakpoints down to 1024px and capture follow-up tasks for a future tablet narrative.

## Developer Experience
- Wire `npm run dev:web` to reuse the simulator build artefact and fail fast when bundles drift.
- Add Storybook (or Ladle) stories for comparator primitives so product and docs writers can prototype copy in isolation.
- Capture architecture decisions in lightweight ADRs, especially around state container and scenario schema choices.
- Publish a contributor quickstart in `docs/dev-onboarding.md` outlining required tools, scripts, and common failure modes.

## Documentation & Enablement
- Extend the README with a “choosing a scenario” matrix linking poll vs. trigger vs. log narratives.
- Record a short Loom walkthrough once the guided tour lands so stakeholders can review without a local checkout.
- Schedule a docs/content review gate ahead of the first workshop to ensure UI strings and external messaging match.

## QA & Automation
- Promote the existing playwright smoke to cover comparator preview, tag filtering, and summary copy actions across browsers.
- Add snapshot-backed regression tests for harness HTML reports so layout tweaks remain intentional.
- Gate `main` merges on `npm run build:sim` and `npm run build:web` by wiring them into the shared CI workflow with caching.
- Create seed reset fixtures for the simulator so parallel test runs can share deterministic timestamp expectations.

## Launch Readiness
- Define feature flag rollout steps (staging, beta accounts, GA) and document exit criteria for each gate.
- Prepare change log entries, upgrade notes, and support macros describing the new comparator capabilities.
- Schedule a live dry run with solutions engineers to validate workshop flow, recording callouts for product follow-ups.
- Draft a rollback plan that toggles comparator features while preserving new schema/data artefacts.

## Post-Launch Follow-Up
- Instrument adoption metrics for preview modal usage vs. direct workspace load to identify onboarding friction.
- Collect qualitative feedback from the first three customer sessions and translate into a prioritized polish backlog.
- Revisit scenario taxonomy quarterly to ensure tag coverage stays aligned with roadmap themes.
