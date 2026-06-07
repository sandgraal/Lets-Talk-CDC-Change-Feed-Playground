# Docs Index

Documentation for the **Change Feed Playground** — the interactive CDC simulator.

> **Scope note:** this repo is the simulator + the failure-aware Docker pipeline. General CDC *education* (concepts, glossary, learning paths, vendor mappings) lives on the companion site **[Let's Talk CDC](https://sandgraal.github.io/letstalkcdc/)**, not here. See [`AGENT_TEAM_BRIEF.md`](AGENT_TEAM_BRIEF.md) §0 for the boundary. Docs below tagged **🔀 migration candidate** read as general CDC education and may belong on `letstalkcdc`; moving them is a maintainer decision, not done unilaterally.

## Start here
- [AGENT_TEAM_BRIEF.md](AGENT_TEAM_BRIEF.md) — scope, boundaries, what was fixed, and the prioritized backlog. **Read first.**
- [REVIEW_SUMMARY.md](REVIEW_SUMMARY.md) — quick strengths/gaps snapshot.
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) — deep dive across architecture, tests, and feature flags.

## Using the simulator (tool-scoped)
- [comparator-guide.md](comparator-guide.md) — launch, navigate, and demo the React comparator shell.
- [configuration-guide.md](configuration-guide.md) — run-mode matrix, feature-flag sources, Appwrite setup.
- [feature-flags.md](feature-flags.md) — flag catalogue and defaults.
- [canonical-scenario.md](canonical-scenario.md) — the failure-aware Docker reference pipeline (what should/does happen, recovery).

## CDC content (🔀 migration candidates — overlap with letstalkcdc)
- [cdc-method-cheatsheet.md](cdc-method-cheatsheet.md) 🔀 — Polling/Trigger/Log/Outbox selection guide.
- [cdc-demo-playbook.md](cdc-demo-playbook.md) 🔀 — narrative demo scripts.
- [cdc-lab-recipes.md](cdc-lab-recipes.md) 🔀 — guided labs (latency, ordering, schema change, deletes).
- [change-feed-evaluation-checklist.md](change-feed-evaluation-checklist.md) 🔀 — scoring script for comparing methods.

> These four are valuable but read as general CDC teaching. Per the brief's W2, evaluate per-doc whether they should migrate to `letstalkcdc` and be replaced here by a deep link.

## Engineering & ops
- [development.md](development.md) — day-to-day workflow, branching, PRs.
- [dev-onboarding.md](dev-onboarding.md) — architecture crash course + debug API.
- [performance-budgets.md](performance-budgets.md) — bundle/load baselines.
- [telemetry-taxonomy.md](telemetry-taxonomy.md) — analytics/funnel event schema.
- [harness-guide.md](harness-guide.md) / [harness-history.md](harness-history.md) — verification harness.
- [content-review-checklist.md](content-review-checklist.md) — copy review checklist.

## Planning & status
- [ACTION_PLAN.md](ACTION_PLAN.md) — prioritized follow-ups.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — shipped scope for the `0.1.0` snapshot.
- [next-steps.md](next-steps.md) — sprint backlog.
- [launch-readiness.md](launch-readiness.md) — rollout checklist.
- [risk-register.md](risk-register.md) — risks + mitigations.
- [post-launch-feedback.md](post-launch-feedback.md) — feedback intake.

## Reference
- [adrs/](adrs/) — architecture decision records.
- [enablement/](enablement/) — release notes, scenario taxonomy, support macros, visual-regression notes.
- [issues/](issues/) — tracked design/issue write-ups.
- [schema/](schema/) — scenario JSON schema.
