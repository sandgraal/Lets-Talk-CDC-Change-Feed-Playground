# Risk Register

| Risk | Status | Mitigation |
| --- | --- | --- |
| Dual-stack UI (legacy vs React) diverges | Mitigated | Single scenario source (`assets/shared-scenarios.js`), telemetry coverage on comparator interactions, and lane diff overlays flag drift. Kill-switch = retire legacy once adoption telemetry shows 80% comparator usage. |
| Harness start-up races produce flaky verification | Mitigated | Service health checks + generator retry loop + `harness/Makefile` commands for deterministic bring-up. |
| Timeline performance >1k events | Mitigated | Memoized filtering plus a capped 200-event window keep renders responsive; monitor telemetry for workloads >5k events. |
| Insight copy/screenshots drift between product and docs | Mitigated | Comparator snapshots persisted in exports + taxonomy doc for copy sync; publishing gate recorded here. |
| Schema migrations without comparator coverage | Mitigated | Property-based simulator suite (`npm run test:sim`) enforces delete/order invariants and runs in CI preflight. |
