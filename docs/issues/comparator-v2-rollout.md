# Issue: Complete `comparator_v2` staged rollout readiness

## Summary
Finish the launch readiness work for the `comparator_v2` flag by validating CI health, soaking the flag in our own environments, and updating the internal launch notes + rollback steps.

## Motivation
Launch readiness notes highlight outstanding tasks before we make the refreshed comparator the default. We no longer have external cohorts, but we still want one place that tracks the checks we run before flipping the flag on permanently.

## Task Checklist
- [ ] Re-run CI preflight (`npm run ci:preflight`) and ensure Playwright + harness checks are green.
- [ ] Enable `comparator_v2` locally for both of us, soak through manual use, and capture notes (bugs, UX nits, confidence level).
- [ ] Run the comparator smoke + harness verification with the flag forced on and record the results in `docs/launch-readiness.md`.
- [ ] Update the internal release notes + support snippets with any guidance we want handy once the flag is permanent.
- [ ] Decide when to flip the default in `index.html`, commit the change, and document rollback instructions alongside the decision.

## Testing Notes
- Full CI preflight and any manual smoke required for staged rollout sign-off.

## Related Resources
- `docs/launch-readiness.md`
- `docs/enablement/release-notes.md`
- `.github/workflows/preflight.yml`
