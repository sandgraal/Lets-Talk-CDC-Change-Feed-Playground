# Launch Readiness Plan

Follow the tracked tasks in [docs/issues/comparator-v2-rollout.md](./issues/comparator-v2-rollout.md) to complete the internal rollout.

## Feature flag rollout
1. **Preflight** – run `npm run ci:preflight` and confirm comparator smoke + harness checks stay green with the flag enabled.
2. **Soak** – force `comparator_v2` on in our local builds for a few sessions, jot down issues or UX nits, and fix anything blocking confidence.
3. **Default-on** – once we are happy with the soak notes, change the default in `index.html`, commit it, and log the decision in `docs/issues/comparator-v2-rollout.md`.

Each step requires:
- Comparator diff overlays enabled without regressions (CI preflight + Playwright smoke passing).
- Playwright smoke (`npm run test:e2e`) executes the apply-on-commit transactions scenario end-to-end.
- Lane checks summary panel renders diff chips per method and Inspect CTA opens the detailed overlay.
- Harness verifier PASS against shared fixtures (`make status`).
- Documentation updates reviewed via `docs/content-review-checklist.md`.

## Communications
- Refresh `docs/enablement/release-notes.md` with any final highlights or troubleshooting tips we want for ourselves.
- Note the flag change in the changelog section of `docs/content-review-checklist.md` for easy future reference.
- Keep `docs/enablement/support-macros.md` aligned so we have copy/paste text for internal toggles or quick rollback notes.

## Rollback
- Toggle `comparator_v2` feature flag to revert UI to legacy experience.
- Retain schema/data artefacts; telemetry buffer stored locally so no migration required.
- If diff overlays misbehave, disable via `DIFF_OVERLAY=false` env variable in comparator bootstrap (`assets/app.js`).

## Dry run
Block 30 minutes for both of us to rehearse the walkthrough with the harness data set and capture findings in `docs/post-launch-feedback.md`.
