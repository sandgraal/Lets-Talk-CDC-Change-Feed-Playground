# Launch Readiness Plan

## Feature flag rollout
1. **Internal dogfood** (`comparator_v2` enabled for team accounts only).
2. **Beta cohort** (handful of customers opted in via support macros).
3. **General availability** after telemetry confirms activation + retention goals.

Each gate requires:
- Comparator diff overlays enabled without regressions (CI preflight + Playwright smoke passing).
- Harness verifier PASS against shared fixtures (`make status`).
- Documentation updates reviewed via `docs/content-review-checklist.md`.

## Communications
- Changelog entry drafted in `docs/enablement/loom-plan.md` outline; publish alongside Loom walkthrough.
- Support macro template added to `docs/enablement/support-macros.md` (see below).

## Rollback
- Toggle `comparator_v2` feature flag to revert UI to legacy experience.
- Retain schema/data artefacts; telemetry buffer stored locally so no migration required.
- If diff overlays misbehave, disable via `DIFF_OVERLAY=false` env variable in comparator bootstrap (`assets/app.js`).

## Dry run
Schedule a solutions-engineer walk-through using the harness data set; capture findings in `docs/post-launch-feedback.md`.
