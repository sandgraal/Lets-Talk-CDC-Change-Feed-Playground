# Lets Talk CDC – Change Feed Playground

[![Harness Nightly](https://github.com/sandgraal/Lets-Talk-CDC-Change-Feed-Playground/actions/workflows/harness-nightly.yml/badge.svg)](https://github.com/sandgraal/Lets-Talk-CDC-Change-Feed-Playground/actions/workflows/harness-nightly.yml)

A zero-dependency web app that simulates CDC operations and emits Debezium-style events.

---

## 🔥 Start Here: The Canonical Scenario

> **CDC demos that don't show failure are useless.** Start with the real thing.

**[The Failure-Aware CDC Reference Pipeline](scenarios/01-canonical-reference/)** is a complete, runnable CDC pipeline that intentionally triggers every common failure mode:

| Failure               | What You'll Learn                         |
| --------------------- | ----------------------------------------- |
| **Connector Restart** | Offset management, exactly-once semantics |
| **Consumer Lag**      | Backpressure, retention, monitoring       |
| **Schema Evolution**  | Compatibility modes, DDL handling         |
| **Duplicate Events**  | Idempotency, deduplication                |
| **Backfill**          | Ordering guarantees, late-arriving data   |

```bash
cd scenarios/01-canonical-reference
make up      # Start full pipeline
make watch   # Watch failures unfold
make status  # Verify source vs sink
```

📖 **[Full Documentation](docs/canonical-scenario.md)** – What should happen, what actually happens, where people get it wrong, agent sizing, recovery patterns.

Everything else in this repository is optional enrichment. **This is the authoritative reference.**

---

## Quick Start

### For End Users (No Build Required)

Simply open `index.html` in a browser. The basic playground works without any build step.

### For Developers (Full Feature Set)

To enable the CDC Method Comparator and all features:

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Build required bundles:**

   ```bash
   npm run build
   ```

   This generates:

   - `assets/generated/sim-bundle.js` (simulator engines)
   - `assets/generated/ui-shell.js` (React comparator UI)
   - `assets/generated/ui-shell.css` (comparator styles)
   - `assets/generated/changefeed-playground.js` (atomicity playground)

3. **Open in browser:**
   ```bash
   open index.html  # macOS
   # or just double-click index.html
   ```

**Note:** The comparator (`#simShellRoot`) requires the built bundles. If you see "Preparing simulator preview…" or "Enable the comparator_v2 feature flag", run `npm run build` first.

## Key Features

### 🚀 Performance Optimized

- **Virtual Scrolling:** Handles 500+ events at 60fps with automatic windowing
- **React.memo & useCallback:** Optimized renders prevent unnecessary re-calculations
- **Smart Transaction Limits:** Display capped at 20 most recent for smooth UX

### 🎓 Beginner-Friendly

- **Guided Demo Scenarios:** 6 one-click workflows showcasing CDC features
  - Multi-Table Transactions, Schema Evolution, Commit Lag & Drift
  - Backlog Recovery, Event Drops & Faults, Apply Policies
- **Inline Help Tooltips:** Hover over technical terms (LSN, commit drift, apply policy) for instant explanations
- **Visual Event Tracking:** Click any event card to highlight and trace it across all lanes

### 🔧 Developer Tools

- **Event Search & Filter:** Find events by table, transaction ID, primary key, or type across all lanes
- **Cross-Lane Highlighting:** Click an event to see its journey from source → broker → consumer
- **Real-time Metrics:** Lag, backlog, and dropped events displayed with visual indicators

### 📊 Interactive Playground

- **Three-Lane Visualization:** Source rows → Change feed partitions → Consumer tables
- **Apply Policy Toggle:** Compare apply-on-commit vs apply-as-polled behavior
- **Fault Injection:** Simulate network drops (0-40%) to test resilience
- **Schema Drift Controls:** Enable column evolution and projection options

### Build Commands Reference

- `npm run build` - Build everything (sim + web bundles)
- `npm run build:sim` - Build simulator engines only
- `npm run build:web` - Build React comparator shell only
- `npm run check:bundles` - Verify generated assets are present and fresher than sources
- `npm run setup:e2e` - Install Playwright browsers and system deps for E2E runs
- `npm run doctor:e2e` - Confirm Playwright browsers are installed and launchable locally

### Verification

- Property-based invariants: `npm run test:sim` (requires a fresh `npm run build:sim` bundle)
- Unit suite (engine adapters + UI widgets): `npm run test:unit`
- Playwright smoke (CI enforced): `npm run test:e2e`
- Harness HTML snapshot: `npm run test:harness-report`
- Full preflight mirror: `npm run ci:preflight` (sim/web builds + property tests + Playwright + snapshots)
- Nightly harness: `npm run ci:harness` (runs via the **Harness Nightly** workflow and uploads HTML/JSON artifacts under Actions → Harness Nightly)
- Harness Nightly posts PASS/FAIL to Slack via `SLACK_WEBHOOK_URL` so the multi-table verification never slips under the radar.
- Historical summaries: `GITHUB_TOKEN=... npm run harness:history` writes `reports/harness-history.md` by aggregating recent Harness Nightly artifacts.

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
- Preset blueprint cards show example topics/namespaces plus "use when" and "watch for" guidance per method so demos stay opinionated
- Lane diff overlays surface missing/extra/out-of-order operations and lag hotspots per method so insights link to exact events
- Lane checks summary panel aggregates diff chips + max lag per method with an Inspect CTA that opens the detailed overlay
- Metrics dashboard summarises produced/consumed counts, backlog, and lag percentiles per method
- Telemetry client (`window.telemetry`) buffers activation/funnel events locally so tours and tests can assert on adoption flows

### Scenario matrix

| Scenario                    | Use it when…                                                 | Highlights                                                               |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Omnichannel Orders          | Walking through status transitions and fulfilment edge cases | Mix of inserts/updates with delete coverage; great for lag comparisons   |
| Real-time Payments          | Demonstrating idempotent updates or risk review flows        | Trigger overhead tuning + delete capture expectations                    |
| Outbox Relay                | Contrasting log capture with an application-managed outbox   | Ordering and dedupe safety for downstream business events                |
| Snapshot Replay             | Explaining offset resets and re-seeding change feeds         | Drop-snapshot + PK dedupe toggles for idempotent apply                   |
| Retention & Erasure         | Teaching privacy deletes, masking, and legal holds           | Soft-delete visibility + drop snapshot and dedupe controls               |
| Snapshot ➜ Stream Handoff   | Showing snapshot catch-up handing off to change feed tails   | Compare drop-snapshot + dedupe toggles; log vs. trigger resume semantics |
| IoT Telemetry               | Showing rolling measurements with anomaly flags              | Highlights soft-delete vs. log consistency and clock controls            |
| Schema Evolution            | Demonstrating column additions while capturing changes       | Compare immediate log/trigger propagation with polling lag               |
| Orders + Items Transactions | Teaching multi-table commit semantics                        | Toggle apply-on-commit to keep orders/items destinations consistent      |
| CRUD Basic                  | Teaching delete visibility basics                            | Minimal ops for first-time comparator demos                              |
| Burst Updates               | Stressing lag/ordering behaviour under rapid updates         | Highlights polling gaps and diff overlays                                |

## Hacktoberfest 2025

- This repository is registered for Hacktoberfest 2025. Make sure you have signed up at [hacktoberfest.com](https://hacktoberfest.com/).
- Browse open issues labeled `hacktoberfest`, `good first issue`, or `help wanted` to find a place to jump in.
- Follow the contribution workflow described in `CONTRIBUTING.md` so pull requests can be reviewed and merged quickly.

## Companion learning site

This repository is the **interactive CDC simulator** — the hands-on "try it live" tool. For the concepts, beginner on-ramp, glossary, vendor/stack mappings, and written labs, head to the companion education site, **[Let's Talk CDC](https://sandgraal.github.io/letstalkcdc/)**. The two are deliberately separate: this repo stays focused on the simulator and the failure-aware reference pipeline, and links out for teaching rather than duplicating it.

## Project Status & Documentation

**Current Status:** Snapshot build `0.1.0` 🟡 — interactive comparator + change feed playground verified mounting on static HTTP hosting; build, unit (95), property (24), and Playwright E2E (8, incl. a static-hosting smoke test) all green.

Latest assessment:

- 🤝 [Agent Team Brief](docs/AGENT_TEAM_BRIEF.md) – Scope, boundaries vs the `letstalkcdc` site, and the prioritized backlog
- 📚 [Docs Index](docs/README.md) – Map of all documentation by purpose
- 📊 [Implementation Review Summary](docs/REVIEW_SUMMARY.md) – Quick overview of strengths, gaps, and risks
- 📋 [Implementation Status Report](docs/IMPLEMENTATION_STATUS.md) – Deep dive across architecture, tests, and feature flags
- 🎯 [Action Plan](docs/ACTION_PLAN.md) – Prioritized follow-ups to reach world-class readiness
- 🎬 [CDC Demo Playbook](docs/cdc-demo-playbook.md) – Ready-to-run scripts for showcasing change feed behaviors
- 🧪 [CDC Lab Recipes](docs/cdc-lab-recipes.md) – Guided labs that highlight latency, ordering, schema change, and delete semantics
- 🧠 [CDC Method Cheat Sheet](docs/cdc-method-cheatsheet.md) – Quick selection guide for Polling, Triggers, Log, and Outbox
- ✅ [Change Feed Evaluation Checklist](docs/change-feed-evaluation-checklist.md) – Quick scoring script for comparing Polling, Trigger, and Log capture
- 🧭 [CDC Method Comparator Guide](docs/comparator-guide.md) – How to launch, navigate, and demo the React comparator shell
- ⚙️ [Configuration Guide](docs/configuration-guide.md) – Run-mode matrix, feature flag sources, and Appwrite setup tips

## Contributing

We welcome improvements to the simulator, documentation, and learning resources. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and the day-to-day [`Development Playbook`](docs/development.md) for branching conventions, pull request expectations, and quality guidelines before you start work.

## Deploy to Appwrite Sites

1. Build the simulator, comparator, and playground bundles:

   ```bash
   npm run package:appwrite
   ```

   This produces `dist/appwrite-site` plus `dist/appwrite-site.zip` containing `index.html`, `assets/`, `docs/`, and `CDC_logo.png`.

2. Upload `dist/appwrite-site.zip` in the Appwrite **Sites** console (or sync the `dist/appwrite-site` folder if you use the Appwrite CLI).

3. If you front the site with Appwrite or a CDN that requires headers for bundle fetches, configure `window.APPWRITE_CFG.assetHeaders` before loading `index.html` so `assets/ui-shell-loader.js` can pull the generated modules.

## Roadmap

- Realtime stream via Appwrite Realtime (broadcast ops to multiple clients).
- Save/load scenarios in Appwrite Databases (multi-device).
- Shareable scenario link (base64 or shortlink).
