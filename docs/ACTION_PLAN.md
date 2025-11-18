# Action Plan – November 2025 Review
**Created:** 2025-11-17  
**Review Reference:** [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)

---

## Quick Summary
Focus this cycle on restoring automated E2E coverage, eliminating feature flag drift, and adding guardrails so the reverted `index.html` remains performant and in sync with generated assets.

---
---
## ✅ Completed in This Pass
- Refreshed status/reporting docs to reflect the `0.1.0` snapshot and current test signal.
- Updated README “Current Status” to avoid overstating readiness.

---

## 🚀 Phase 1: Critical (This Week)
1. **Unblock Playwright E2E**
   - [x] Add `npx playwright install --with-deps` (or setup action) to CI and document local command in `docs/development.md` - **COMPLETED** (CI already has install step in preflight.yml; added comprehensive local setup docs)
   - [ ] Rerun `npm run test:e2e`; attach trace artifacts and capture failures if any persist beyond browser install.
   - [ ] Cache browser binaries to keep CI stable.

2. **Align Feature Flag Defaults**
   - [x] Decide shipping stance for `ff_walkthrough` and `ff_trigger_mode` - **COMPLETED** (both enabled as ready)
   - [x] Update `index.html`, `assets/feature-flags.js` consumers, and `docs/feature-flags.md` together based on the decision - **COMPLETED**
   - [x] Add a shared flag manifest (JSON/TS) to prevent future drift across docs, loaders, and tests - **COMPLETED** (manifest exists and lint:flags validates alignment)

3. **Bundle Freshness & Perf Guardrails**
   - [x] Add a check (script or CI step) that asserts generated bundles in `assets/generated/` are fresh relative to source before publishing - **COMPLETED** (`check:bundles` now fails when sim/web sources are newer than generated assets and is included in `ci:preflight`)
   - [ ] Capture baseline load metrics for the reverted shell (LCP/TTI/transfer size) and document budgets in `docs/development.md`.

---

## ⏭️ Phase 2: Hardening (Next 1–2 Weeks)
1. **Documentation Touch-ups**
   - [x] Add a short "rerun E2E locally" section (Playwright install + common failure modes) to the development playbook - **COMPLETED** (added comprehensive E2E testing section to development.md)
   - [x] Clarify in `docs/feature-flags.md` how query params, Appwrite config, and localStorage are merged - **COMPLETED** (added detailed merge behavior explanation with examples)

2. **Security & Dependency Hygiene**
   - [ ] Add a lightweight `npm audit --production` job in CI; document the expected cadence for running it locally.
   - [ ] Evaluate whether Playwright/browser caching affects container image size; document mitigations if needed.

3. **Harness & Transaction Drift Verification**
   - [ ] Once E2E is unblocked, rerun harness/nightly checks and confirm transaction drift scenarios stay green.
   - [ ] Capture any flakiness and add retries or timeouts where appropriate.

---

## Ownership & Check-ins
- **Owner:** Core duo (rotating)  
- **Cadence:**
  - Daily: Track E2E unblock progress
  - Weekly: Review perf budgets and bundle freshness check outcomes
  - End of month: Update status + action plan based on new test signal
