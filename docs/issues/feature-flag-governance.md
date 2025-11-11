# Issue: Plan feature flag activation sequencing & telemetry validation

## Summary
Define the activation plan for the remaining feature flags (`ff_trigger_mode`, `ff_schema_demo`, `ff_multitable`, `ff_metrics`, `ff_walkthrough`) and document the lightweight checks the two of us run before flipping defaults.

## Motivation
Multiple P1 flags remain default-off pending launch timing. We no longer juggle external cohorts, but we still need a clear order of operations, verification checklist, and rollback notes so future flips stay disciplined.

## Task Checklist
- [ ] Inventory each flag’s current default, dependencies, and UI coverage.
- [ ] Capture the pre-flight checklist we will run before promoting a flag to default-on (CI preflight, targeted manual smoke, doc sanity checks).
- [ ] Decide the activation order for the P1 set so we avoid conflicting toggles or surprise UX shifts.
- [ ] Write down the rollback steps for each flag (where to toggle, which docs to touch, any data clean-up).
- [ ] Update `docs/feature-flags.md` and related enablement material with the finalized governance plan.

## Testing Notes
- Validate telemetry hooks locally (unit tests if possible) and confirm dashboards receive events in staging.

## Related Resources
- `docs/feature-flags.md`
- `docs/launch-readiness.md`
- Telemetry implementation under `src/engine/metrics`
