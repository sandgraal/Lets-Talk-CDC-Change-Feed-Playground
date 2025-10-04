# Lets Talk CDC – Change Feed Playground

A zero-dependency web app that simulates CDC operations and emits Debezium-style events.

## Run locally
Open `index.html` in a browser. No build step.

### Simulator bundle
- Install tooling: `npm install`
- Build the simulator modules: `npm run build:sim`

The build emits `assets/generated/sim-bundle.js`, which `assets/sim-loader.js` loads on demand so the existing UI can access the TypeScript engines.

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
