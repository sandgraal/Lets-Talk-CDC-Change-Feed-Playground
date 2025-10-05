# Scenario Taxonomy Quarterly Review

## Purpose
Ensure curated scenarios, tags, and copy stay aligned with roadmap themes and observed usage.

## Cadence
- **Frequency:** Quarterly (first Monday of each quarter).
- **Duration:** 45 minutes.
- **Owners:**
  - Product (Christopher Ennis)
  - Solutions Engineering (assigned liaison)
  - Engineering (CDC comparator maintainer)

## Pre-work
1. Export telemetry snapshot:
   ```bash
   node scripts/report-scenario-usage.mjs > tmp/scenario-usage.json
   ```
2. Run `npm run snapshot:scenarios` to refresh fixtures.
3. Prepare diff of `assets/shared-scenarios.js` vs. previous quarter (git)
4. Collect feedback from support macros tagged `scenario_request`.

## Agenda
1. Review telemetry: scenario selections, search tags, comparator tour completion.
2. Audit scenario coverage vs. roadmap themes (data freshness, CDC methods, industry verticals).
3. Identify additions/retirements; assign owners for follow-up PRs.
4. Confirm documentation updates (README scenario matrix, Loom walkthrough where applicable).
5. Log decisions/outcomes in `docs/post-launch-feedback.md` ("Scenario Review" section).

## Follow-Up
- File issues/PRs for any scenario changes within one week.
- Update `docs/next-steps.md` if roadmap shifts or new risks emerge.
