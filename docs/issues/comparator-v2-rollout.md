# Issue: Complete `comparator_v2` staged rollout readiness

## Summary
Finish the launch readiness work for the `comparator_v2` flag by walking through the staged rollout gates, validating CI health, and preparing communications/rollback materials.

## Motivation
Launch readiness notes highlight outstanding tasks before GA. Documenting them as an issue ensures we track internal dogfood, beta cohort validation, GA approval, and accompanying comms.

## Task Checklist
- [ ] Re-run CI preflight (`npm run ci:preflight`) and ensure Playwright + harness checks are green.
- [ ] Execute the internal dogfood gate: enable the flag for team accounts, collect telemetry, and log findings.
- [ ] Prepare beta cohort allowlist + support macros; monitor activation + retention metrics.
- [ ] Draft and review GA communications (release notes, Loom walkthrough, support macros) and confirm rollback plan.
- [ ] Capture rollout outcomes + links in `docs/launch-readiness.md` and update status.
- [ ] Decide on flag default-on timing and document governance plan post-launch.

## Testing Notes
- Full CI preflight and any manual smoke required for staged rollout sign-off.

## Related Resources
- `docs/launch-readiness.md`
- `docs/enablement/release-notes.md`
- `.github/workflows/preflight.yml`
