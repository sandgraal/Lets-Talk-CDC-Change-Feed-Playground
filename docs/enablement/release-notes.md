# Release Notes – CDC Comparator Update

## Highlights
- Added the **Orders + Items Transactions** scenario that streams multi-table commits so teams can observe downstream consistency gaps.
- Introduced an **Apply-on-commit** toggle to hold consumer apply until every event in the transaction is available, demonstrating atomic fan-out.
- Re-enabled the Playwright smoke suite (`npm run test:e2e`) to exercise the new scenario alongside existing comparator basics.

## Boosters for GTM / Support
- Emphasise in messaging that toggling Apply-on-commit while the scenario plays shows partial vs consistent destinations.
- Point feature-flag aware customers to `comparator_v2`; no new flags are required for this release.
- Support macro update: remind agents to ask whether Apply-on-commit is enabled when troubleshooting transaction drift.

## QA / Verification
- CI now runs the full Playwright comparator smoke. Manual spot check: run `npm run test:e2e` locally after `npm run build`.
- Add a quick harness sanity sweep (`make status`) if demoing with external datasets.
