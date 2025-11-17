# Issue: Add end-to-end coverage for transaction drift scenario

## Summary
Create an automated end-to-end test that validates transaction drift handling in the multi-table demo, ensuring apply-on-commit behaviour stays correct.

## Motivation
Although the multi-table + transactions demo shipped, the follow-up E2E test remains on the backlog. Automating it protects against regressions in commit-order handling and diff overlays.

## Task Checklist
- [x] Define the transaction drift scenario steps (generator data, expected lane diffs) and capture them as fixtures.
- [x] Extend Playwright or harness-based tests to execute the scenario, including toggling apply-on-commit and validating UI indicators.
- [x] Add assertions for event ordering, lag metrics, and diff overlays specific to transaction drift.
- [x] Ensure the test runs in CI preflight and document runtime considerations.
- [x] Update documentation summarizing the new automated coverage and how to run it locally.

`tests/e2e/transaction-drift.spec.mjs` now exercises the Orders + Items Transactions scenario with the new `window.cdcComparatorDebug` API, throttling the consumer to capture intermediate states and asserting that lane histories include partial row counts only when apply-on-commit is disabled. The debug API/coverage is documented in `docs/dev-onboarding.md`, and the Playwright suite (via `npm run test:e2e`) now enforces the behaviour in CI.

## Testing Notes
- Run `npm run test:e2e` locally to confirm the new test passes.
- If using harness workflow, also run `npm run ci:harness` or the specific make target referenced in docs.

## Related Resources
- `tests/e2e` Playwright suite
- `sim/` generator fixtures
- `docs/next-steps.md` (transaction drift backlog reference)
