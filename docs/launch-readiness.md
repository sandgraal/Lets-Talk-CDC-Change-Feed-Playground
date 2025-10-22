# Launch Readiness Plan

## Feature flag rollout
1. **Internal dogfood** (`comparator_v2` enabled for team accounts only).
2. **Beta cohort** (handful of customers opted in via support macros).
3. **General availability** after telemetry confirms activation + retention goals.

Each gate requires:
- Comparator diff overlays enabled without regressions (CI preflight + Playwright smoke passing).
- Playwright smoke (`npm run test:e2e`) executes the apply-on-commit transactions scenario end-to-end.
- Lane checks summary panel renders diff chips per method and Inspect CTA opens the detailed overlay.
- Harness verifier PASS against shared fixtures (`make status`).
- Documentation updates reviewed via `docs/content-review-checklist.md`.

### Feature flag matrix
| Week | Audience | Flag state | Owner | Success signals |
| --- | --- | --- | --- | --- |
| Week 1 | Internal team accounts | `comparator_v2` forced **on** | Eng Enablement | Comparator smoke telemetry ≥ 5 sessions, no blocker bugs |
| Week 2 | Design partners (beta cohort) | `comparator_v2` on for allowlist | PM + Solutions | ≥ 70% tour completion, < 10% opt-out requests |
| Week 3 | General availability | `comparator_v2` default **on**, opt-out supported via support macro | PMM | GA announcement published, support queue clear |
| Week 4 | Post-launch review | Flag remains on; opt-out available on request | PM + Eng | Retention and telemetry goals met; decision on flag retirement |

## Communications
- Changelog entry drafted in `docs/enablement/loom-plan.md` outline; publish alongside Loom walkthrough.
- Highlight the new “Orders + Items Transactions” scenario and Apply-on-commit toggle in release notes / launch materials.
- Support macro template added to `docs/enablement/support-macros.md` (see below).

## Rollback
- Toggle `comparator_v2` feature flag to revert UI to legacy experience.
- Retain schema/data artefacts; telemetry buffer stored locally so no migration required.
- If diff overlays misbehave, disable via `DIFF_OVERLAY=false` env variable in comparator bootstrap (`assets/app.js`).

## Dry run
Schedule a solutions-engineer walk-through using the harness data set; capture findings in `docs/post-launch-feedback.md`.
