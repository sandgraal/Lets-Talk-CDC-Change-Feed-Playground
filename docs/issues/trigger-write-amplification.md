# Issue: Surface trigger write amplification insights in UI & walkthrough

## Summary
Expose trigger-based CDC write amplification metrics in the comparator UI and integrate the insights into the guided walkthrough so users understand the operational trade-offs.

## Motivation
The trigger mode adapter already captures write amplification metadata, but the UI does not surface it. Highlighting the cost in both dashboards and the walkthrough keeps the demo accurate and educational.

## Task Checklist
- [ ] Audit trigger mode metrics emitted from `src/modes/triggerBased.ts` and confirm write amplification counters are available.
- [ ] Design UI presentation for amplification (metrics strip, tooltips, or dedicated panel) and update components under `src/ui/components` accordingly.
- [ ] Extend the guided walkthrough content to call out write amplification implications for trigger mode.
- [ ] Gate the new visuals/content behind the relevant feature flag (`ff_trigger_mode`) and ensure sensible fallbacks when disabled.
- [ ] Add unit + story coverage for the new UI surfaces and extend Playwright smoke to validate walkthrough updates.
- [ ] Refresh docs (feature flags, release notes, enablement collateral) describing the new insight.

## Testing Notes
- `npm run test:unit` for component coverage.
- `npm run test:e2e` to confirm walkthrough + UI flows.
- Update or add Ladle stories for the new metrics presentation and capture visual references.

## Related Resources
- `src/modes/triggerBased.ts`
- `src/ui/components/MetricsStrip.tsx` and related dashboards
- `docs/enablement/loom-plan.md`, `docs/next-steps.md`
