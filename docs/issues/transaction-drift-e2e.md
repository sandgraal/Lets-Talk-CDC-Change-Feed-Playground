# Issue: Add end-to-end coverage for transaction drift scenario

## Summary
Create an automated end-to-end test that validates transaction drift handling in the multi-table demo, ensuring apply-on-commit behaviour stays correct.

## Motivation
Although the multi-table + transactions demo shipped, the follow-up E2E test remains on the backlog. Automating it protects against regressions in commit-order handling and diff overlays.

## Task Checklist
- [ ] Define the transaction drift scenario steps (generator data, expected lane diffs) and capture them as fixtures.
- [ ] Extend Playwright or harness-based tests to execute the scenario, including toggling apply-on-commit and validating UI indicators.
- [ ] Add assertions for event ordering, lag metrics, and diff overlays specific to transaction drift.
- [ ] Ensure the test runs in CI preflight and document runtime considerations.
- [ ] Update documentation summarizing the new automated coverage and how to run it locally.

## Testing Notes
- Run `npm run test:e2e` locally to confirm the new test passes.
- If using harness workflow, also run `npm run ci:harness` or the specific make target referenced in docs.

## Related Resources
- `tests/e2e` Playwright suite
- `sim/` generator fixtures
- `docs/next-steps.md` (transaction drift backlog reference)
