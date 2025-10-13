# Lets Talk CDC – Change Feed Playground

[![Harness Nightly](https://github.com/sandgraal/Lets-Talk-CDC-Change-Feed-Playground/actions/workflows/harness-nightly.yml/badge.svg)](https://github.com/sandgraal/Lets-Talk-CDC-Change-Feed-Playground/actions/workflows/harness-nightly.yml)

> Live playground: [https://girhun.github.io/Lets-Talk-CDC-Change-Feed-Playground/](https://girhun.github.io/Lets-Talk-CDC-Change-Feed-Playground/)

A zero-dependency web app that simulates CDC operations and emits Debezium-style events.

## Run locally
Open `index.html` in a browser. No build step.

### Build artefacts
- Install tooling: `npm install`
- Build simulator engines: `npm run build:sim` → emits `assets/generated/sim-bundle.js` for `assets/sim-loader.js`
- Build the React comparator shell: `npm run build:web` → emits `assets/generated/ui-shell.js` for `assets/ui-shell-loader.js`
- Build everything: `npm run build`

### Verification
- Property-based invariants: `npm run test:sim` (requires a fresh `npm run build:sim` bundle)
- Unit suite (engine adapters + UI widgets): `npm run test:unit`
- Playwright smoke (CI enforced): `npm run test:e2e`
- Harness HTML snapshot: `npm run test:harness-report`
- Full preflight mirror: `npm run ci:preflight` (sim/web builds + property tests + Playwright + snapshots)
- Nightly harness: `npm run ci:harness` (runs via the **Harness Nightly** workflow and uploads HTML/JSON artifacts under Actions → Harness Nightly)
- Harness Nightly posts PASS/FAIL to Slack via `SLACK_WEBHOOK_URL` so the multi-table verification never slips under the radar.

### Harness
- Prepare a shared scenario: `npm run prepare:scenario -- orders`
- Bring the stack up: `cd harness && make up`
- Inspect reports: `make status` (JSON) or browse `http://localhost:8089`
- Refresh fixtures from shared scenarios: `npm run snapshot:scenarios`

The comparator mount (`#simShellRoot`) streams the Polling/Trigger/Log engines in parallel to visualise lag, ordering, and delete capture differences.

### Advanced controls
- Polling: `poll_interval_ms` knob plus optional soft-delete visibility
- Trigger: extractor cadence and per-write trigger overhead
- Log: WAL/Binlog fetch interval
- Schema walkthrough: add/drop columns on the fly to watch schema change events propagate
- Live workspace feed: the comparator listens for table mutations and exposes them as a "Workspace (live)" scenario alongside curated demos
- Shared Event Log renderer powers both the playground and comparator, with filters, per-event copy, and NDJSON export
- Comparator preferences (scenario, methods, knobs) persist locally so you resume where you left off
- Exports/imports carry comparator preferences and the latest insight snapshot for consistent replays
- Curated scenarios live in `assets/shared-scenarios.js`; update that module once to change both the template gallery and comparator demos
- Apply-on-commit toggle delays downstream apply until every event in the transaction is present, keeping multi-table writes atomic
- Comparator lets you push any scenario back into the workspace via the new “Load in workspace” shortcut
- Vendor presets badge the Source → Capture → Transport → Sink pipeline with tooltip copy + docs links per stack
- Lane diff overlays surface missing/extra/out-of-order operations and lag hotspots per method so insights link to exact events
- Lane checks summary panel aggregates diff chips + max lag per method with an Inspect CTA that opens the detailed overlay
- Metrics dashboard summarises produced/consumed counts, backlog, and lag percentiles per method
- Telemetry client (`window.telemetry`) buffers activation/funnel events locally so tours and tests can assert on adoption flows

### Scenario matrix

| Scenario | Use it when… | Highlights |
| --- | --- | --- |
| Omnichannel Orders | Walking through status transitions and fulfilment edge cases | Mix of inserts/updates with delete coverage; great for lag comparisons |
| Real-time Payments | Demonstrating idempotent updates or risk review flows | Trigger overhead tuning + delete capture expectations |
| IoT Telemetry | Showing rolling measurements with anomaly flags | Highlights soft-delete vs. log consistency and clock controls |
| Schema Evolution | Demonstrating column additions while capturing changes | Compare immediate log/trigger propagation with polling lag |
| Orders + Items Transactions | Teaching multi-table commit semantics | Toggle apply-on-commit to keep orders/items destinations consistent |
| CRUD Basic | Teaching delete visibility basics | Minimal ops for first-time comparator demos |
| Burst Updates | Stressing lag/ordering behaviour under rapid updates | Highlights polling gaps and diff overlays |

## Hacktoberfest 2025
- This repository is registered for Hacktoberfest 2025. Make sure you have signed up at [hacktoberfest.com](https://hacktoberfest.com/).
- Browse open issues labeled `hacktoberfest`, `good first issue`, or `help wanted` to find a place to jump in.
- Follow the contribution workflow described in `CONTRIBUTING.md` so pull requests can be reviewed and merged quickly.

## Contributing
We welcome improvements to the simulator, documentation, and learning resources. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for branching conventions, pull request expectations, and quality guidelines before you start work.

## Deploy to GitHub Pages
- Run `npm run build:web` to refresh the Vite bundle under `assets/generated/`.
- Commit the updated bundle together with `index.html` and push to the default branch.
- In the repository settings, set GitHub Pages to deploy from the root of the `main` branch.
- The playground will publish to `https://girhun.github.io/Lets-Talk-CDC-Change-Feed-Playground/`, and share links use that origin via `window.APPWRITE_CFG.shareBaseUrl`.
## Deploy to Appwrite Sites
Zip the files:
- `index.html`
- `assets/styles.css`
- `assets/app.js`

Upload the zip in Appwrite Console → **Sites** → **Manual upload**.
The GitHub Pages deployment now lives at `https://girhun.github.io/Lets-Talk-CDC-Change-Feed-Playground/`; the Appwrite Sites workflow is kept here for historical reference.

## Roadmap
- Realtime stream via Appwrite Realtime (broadcast ops to multiple clients).
- Save/load scenarios in Appwrite Databases (multi-device).
- Shareable scenario link (base64 or shortlink).
