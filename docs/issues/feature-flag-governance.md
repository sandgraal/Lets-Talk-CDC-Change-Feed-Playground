# Issue: Plan feature flag activation sequencing & telemetry validation

## Summary
Define the activation plan for remaining feature flags (`ff_trigger_mode`, `ff_schema_demo`, `ff_multitable`, `ff_metrics`, `ff_walkthrough`) and wire telemetry checks to confirm safe rollout.

## Motivation
Multiple P1 flags remain default-off pending launch timing. Establishing sequencing, telemetry dashboards, and rollback criteria ensures smooth enablement across cohorts.

## Task Checklist
- [ ] Inventory each flag’s current default, dependencies, and UI coverage.
- [ ] Define activation cohorts and timing, aligning with launch readiness + product milestones.
- [ ] Implement telemetry logging/dashboards to monitor adoption, errors, and opt-outs per flag.
- [ ] Document rollback procedures and support macros for each flag.
- [ ] Update `docs/feature-flags.md` and related enablement material with the finalized governance plan.

## Testing Notes
- Validate telemetry hooks locally (unit tests if possible) and confirm dashboards receive events in staging.

## Related Resources
- `docs/feature-flags.md`
- `docs/launch-readiness.md`
- Telemetry implementation under `src/engine/metrics`
