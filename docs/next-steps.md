# Implementation Next Steps

_Tooling status: `npm run build:sim` → `assets/generated/sim-bundle.js`, `npm run build:web` → `assets/generated/ui-shell.js`. React comparator now renders multi-lane polling/trigger/log preview with tunable method controls._

## Status Snapshot
- Completed: Copy alignment (`assets/method-copy.js`), comparator overlays, deterministic clock controls, harness automation, telemetry client, and CI/readiness assets are in place (see sections below for detail).
- Outstanding focus: Guided onboarding spotlight scripting, timeline performance strategy, Loom walkthrough recording, and the recurring scenario taxonomy review.

## Implementation Plan (Remaining Deliverables)
1. Guided onboarding polish
   - ✅ Scripted the dual-track spotlight sequence that reuses comparator callouts.
   - ☐ File and prioritize the tooltip synchronization story for the legacy shell.
   - ✅ Aligned guided tour milestones with telemetry events (`tour.started` / `tour.completed` / `tour.dismissed`).
2. Scenario source-of-truth guardrails
   - ✅ Added a lint rule that blocks ad-hoc scenario JSON outside `assets/shared-scenarios.js`.
   - ✅ Extended CI preflight with a check diffing generated bundles against the shared module output.
3. Feature flag rollout readiness
   - ✅ Implemented the `comparator_v2` runtime hook in the shell bootstrap.
   - ✅ Captured the staged rollout calendar inside `docs/launch-readiness.md` and circulated with Solutions Engineering.
4. Copy alignment and education
   - ✅ Finalized “honest callouts” and “when to use which” copy blocks and wired them into the comparator UI via `assets/method-copy.js`.
   - ✅ Mirrored the copy updates in supporting docs (method guidance panel + checklist note) so product, docs, and telemetry taxonomies stay in sync.
5. Timeline performance hardening
   - Profile comparator timelines with >1k events, document findings, and prototype virtualization if required.
   - Record the decision and thresholds in the risk register once validated.
6. Enablement and post-launch cadence
   - Record and publish the Loom walkthrough once guided tour polish ships.
   - Stand up a quarterly review ritual for scenario taxonomy coverage (owners, agenda, telemetry inputs).

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
- ✅ “Honest callouts” / “when to use which” copy lives in `assets/method-copy.js`, surfaced in comparator lanes and the legacy shell guidance panel.
- ✅ Telemetry taxonomy documented in `docs/telemetry-taxonomy.md`, mapping events to activation, funnel-drop, completeness, and collaboration questions.

## Risks to Monitor
- ✅ Dual-stack divergence mitigated via shared scenario module enforcement and telemetry coverage; kill-switch criteria recorded in `docs/risk-register.md`.
- ✅ Harness reliability improved with health checks, generator backoff, and documented Make targets.
- Performance of timeline rendering with >1k events—prototype virtualization approach early. _(open)_
- ✅ Insight copy alignment tracked through telemetry taxonomy + snapshot exports; publishing gate documented in risk register.
- ✅ Schema migration risk mitigated by property-test suite (`npm run test:sim`) executed in CI preflight.

## React Comparator Polish
- ✅ Inline diff gutters ship with lane overlays that surface missing/extra/order issues and lag hotspots.
- ✅ Global event search + CRUD quick filters trim per-lane timelines; telemetry records usage for guided tours.
- ✅ Timeline visibility persists via comparator preferences (`showEventList`), so shared links honour author intent.
- ✅ Responsive tweaks validated down to 1024px (tablet refinements tracked separately in polish backlog).

## Developer Experience
- ✅ `npm run dev:web` now seeds a fresh simulator build, and `npm run dev:all` runs sim + shell dev servers in parallel.
- ✅ Ladle stories live under `web/stories/`—`npm run ladle` opens the MetricsStrip playground for copy/design review.
- ✅ ADR-001 captures the decision to keep the lightweight emitter/state approach for this release.
- ✅ Contributor quickstart documented in `docs/dev-onboarding.md`.

## Documentation & Enablement
- ✅ README now includes a scenario matrix mapping narratives to template highlights.
- 🚧 Loom walkthrough plan captured in `docs/enablement/loom-plan.md`; recording to follow after guided tour polish.
- ✅ Content review gate/checklist published in `docs/content-review-checklist.md` and linked from the risk register.

## QA & Automation
- ✅ Playwright smoke suite (skipped locally by default, enforced in CI) exercises comparator render, filters, and timeline toggles.
- ✅ Harness HTML snapshot stored in `tests/__snapshots__/harness-report.html` and checked via `npm run test:harness-report`.
- ✅ CI preflight now runs build+property tests+Playwright+snapshot with Playwright browsers installed in the workflow.
- ✅ Simulator seeds captured in `sim/tests/seeds.json` with `npm run sim:seed-reset` to refresh deterministically.

## Launch Readiness
- ✅ Feature flag rollout, rollback, and dry-run steps documented in `docs/launch-readiness.md`.
- ✅ Support macros drafted for rollout/rollback communication (`docs/enablement/support-macros.md`).
- ✅ Loom walkthrough plan captured in `docs/enablement/loom-plan.md`; dry-run feedback to land in `docs/post-launch-feedback.md`.
- ✅ Rollback instructions note flag toggle + diff overlay env switches while preserving schema artefacts.

## Post-Launch Follow-Up
- ✅ Telemetry taxonomy now captures preview usage, diff expansion, share generation, and clock controls.
- ✅ Feedback log template lives in `docs/post-launch-feedback.md` for the first three sessions.
- Revisit scenario taxonomy quarterly to ensure tag coverage stays aligned with roadmap themes. _(open)_
