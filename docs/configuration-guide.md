# CDC Playground Configuration Guide

Use this guide to configure the playground for different demos—from an offline, zero-dependency run to an Appwrite-backed, shareable lab. It highlights the knobs and feature flags that change behaviour so data engineers and architects can set up repeatable sessions quickly.

## Run modes at a glance

| Mode | When to use | Steps |
| --- | --- | --- |
| **Offline (no build)** | Quick orientation to the base playground without the comparator | 1) Clone/zip the repo 2) Open `index.html` directly in the browser 3) Skip npm install/build |
| **Comparator enabled** | Full CDC method comparison (Polling vs Trigger vs Log) with metrics, diffs, and exports | 1) `npm install` 2) `npm run build` to generate `assets/generated/ui-shell.js` & `sim-bundle.js` 3) Open `index.html` and scroll to the **CDC Method Comparator** |
| **Appwrite-connected** | Sharing scenarios or assets from a remote host; injecting feature flags via config | 1) Provide `window.APPWRITE_CFG` before loaders run 2) Include any required `assetHeaders` for hosted bundles 3) Open `index.html` normally |

> Tip: `npm run check:bundles` verifies generated assets are fresher than sources before you ship or demo.

## Feature flag sources & precedence

The playground merges multiple inputs to decide which features are on:

1. `window.APPWRITE_CFG.featureFlags` (if present)
2. `window.CDC_FEATURE_FLAGS` globals defined in `index.html`
3. Browser localStorage (`cdc_feature_flags_v1`)
4. URL parameters: `?flag=ff_metrics&flag=ff_multitable` or `?flags=ff_metrics,ff_multitable`

The consolidated API lives on `window.cdcFeatureFlags` and broadcasts `cdc:feature-flags` events so the comparator shell can lazy-load when `comparator_v2` becomes available. See [`docs/feature-flags.md`](./feature-flags.md) for rollout guidance and the full manifest.

## Appwrite configuration surface

`index.html` seeds an `APPWRITE_CFG` object that you can override for your own stack:

- **endpoint / projectId / databaseId / collectionId / scenarioCollectionId** – Used by the workspace exporter/importer; keep demo data isolated per project.
- **shareBaseUrl** – Host name used when generating share links.
- **channel(db, col)** – Helper to build realtime subscription topics.
- **assetHeaders** – Optional map of headers (e.g., `X-Appwrite-Project`) sent when fetching hosted bundles like `assets/generated/ui-shell.js`.
- **featureFlags** – Flags to inject before localStorage/query params are read; useful for guided sessions or remote deployments.

If you are hosting the bundles behind Appwrite or another CDN that requires headers, set `assetHeaders` so `assets/ui-shell-loader.js` and `assets/event-log-loader.js` can fetch them successfully.

## Comparator configuration cheat sheet

Use these knobs to illustrate specific CDC behaviours:

- **Polling**: `poll_interval_ms` slider and **Show soft deletes** toggle. Widen the interval to amplify lag or hide tombstones to mimic lossy snapshots.
- **Trigger**: **Extract interval** plus **Trigger overhead** to demonstrate write amplification vs. latency trade-offs.
- **Log**: **Fetch interval** to control WAL/binlog polling cadence.
- **Apply on commit**: Keeps multi-table writes atomic downstream; disable to surface drift when events arrive out of order.
- **Drop snapshot rows / Dedupe on PK** (Event Log toolbar): Show how sinks avoid replaying snapshot data or reprocessing after resume.
- **Schema walkthrough**: Add/remove columns mid-run to show how each method propagates DDL vs. DML.
- **Metrics dashboard**: Backlog + lag percentiles per lane; open it when tweaking knobs so stakeholders see quantitative impact.

## Quick validation before demos

Run these once before presenting or sharing artifacts:

- `npm run lint:flags` – Ensures `index.html` aligns with the feature flag manifest.
- `npm run lint:scenarios` – Validates curated scenarios used by both the workspace and comparator.
- `npm run check:bundles` – Confirms generated bundles are present and up to date.
- `npm run test:unit` and `npm run test:sim` – Fast sanity check of adapters and property-based scenarios.

These commands are safe to run locally and mirror the CI preflight expectations documented in `README.md`.
