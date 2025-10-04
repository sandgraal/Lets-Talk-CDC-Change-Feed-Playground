# Lets Talk CDC – Change Feed Playground

A zero-dependency web app that simulates CDC operations and emits Debezium-style events.

## Run locally
Open `index.html` in a browser. No build step.

### Build artefacts
- Install tooling: `npm install`
- Build simulator engines: `npm run build:sim` → emits `assets/generated/sim-bundle.js` for `assets/sim-loader.js`
- Build the React comparator shell: `npm run build:web` → emits `assets/generated/ui-shell.js` for `assets/ui-shell-loader.js`
- Build everything: `npm run build`

The comparator mount (`#simShellRoot`) streams the Polling/Trigger/Log engines in parallel to visualise lag, ordering, and delete capture differences.

### Advanced controls
- Polling: `poll_interval_ms` knob plus optional soft-delete visibility
- Trigger: extractor cadence and per-write trigger overhead
- Log: WAL/Binlog fetch interval
- Live workspace feed: the comparator listens for table mutations and exposes them as a "Workspace (live)" scenario alongside curated demos
- Comparator preferences (scenario, methods, knobs) persist locally so you resume where you left off
- Exports/imports carry comparator preferences and the latest insight snapshot for consistent replays

## Hacktoberfest 2025
- This repository is registered for Hacktoberfest 2025. Make sure you have signed up at [hacktoberfest.com](https://hacktoberfest.com/).
- Browse open issues labeled `hacktoberfest`, `good first issue`, or `help wanted` to find a place to jump in.
- Follow the contribution workflow described in `CONTRIBUTING.md` so pull requests can be reviewed and merged quickly.

## Contributing
We welcome improvements to the simulator, documentation, and learning resources. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for branching conventions, pull request expectations, and quality guidelines before you start work.

## Deploy to Appwrite Sites
Zip the files:
- `index.html`
- `assets/styles.css`
- `assets/app.js`

Upload the zip in Appwrite Console → **Sites** → **Manual upload**.
The site will be available at `https://letstalkcdc.appwrite.network/`.

## Roadmap
- Realtime stream via Appwrite Realtime (broadcast ops to multiple clients).
- Save/load scenarios in Appwrite Databases (multi-device).
- Shareable scenario link (base64 or shortlink).
