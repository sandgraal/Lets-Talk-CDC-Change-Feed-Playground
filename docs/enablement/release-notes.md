# Release Notes – CDC Comparator Update

## Highlights
- Added the **Orders + Items Transactions** scenario that streams multi-table commits so teams can observe downstream consistency gaps.
- Introduced an **Apply-on-commit** toggle to hold consumer apply until every event in the transaction is available, demonstrating atomic fan-out.
- Re-enabled the Playwright smoke suite (`npm run test:e2e`) to exercise the new scenario alongside existing comparator basics.
- Trigger lanes now surface write amplification as a ratio with approximate extra writes per change in the metrics strip, dashboard, and walkthrough callouts.

## Reminders for us
- When we flip `comparator_v2` on by default, call out that toggling Apply-on-commit mid-run shows partial vs consistent destinations.
- No additional flags are required for this release beyond `comparator_v2`; the rest of the experience rides on the existing P0 defaults.
- Update the snippet in `docs/enablement/support-macros.md` so we remember to ask whether Apply-on-commit was enabled while debugging drift.

## QA / Verification
- CI now runs the full Playwright comparator smoke plus the dockerised harness (`npm run ci:harness`) to validate the Orders + Items Transactions scenario end-to-end.
- For manual validation, run `npm run test:e2e` followed by `SCENARIO=orders-transactions make up` and `make status` if you want to observe the Debezium stream locally.
