# Implementation Next Steps

_Tooling status: `npm run build:sim` → `assets/generated/sim-bundle.js`, `npm run build:web` → `assets/generated/ui-shell.js`. React comparator now renders multi-lane polling/trigger/log preview with tunable method controls._

## Immediate Decisions
- **Guided insight UX**: decide how comparator callouts integrate with onboarding/tooltips now that insights surface in the legacy UI.
- **Persisting control state**: determine how method tuning persists across exports/shares (extend payload schema vs. runtime defaults).
- **State container**: confirm whether we stay with lightweight emitters or introduce Zustand/RxJS before guided tour scripting.
- **Scenario source of truth**: converge scenario definitions (legacy templates, React comparator, harness) on one module to prevent drift.

## Near-Term Build Goals
1. Persist workspace scenarios + advanced controls into export/import/share flows, including comparator insight snapshots.
2. Introduce deterministic clock hooks that power the guided onboarding/tour flow across lanes.
3. Implement property-based tests for Polling/Trigger/Log invariants (lag behaviour, delete visibility, ordering).
4. Freeze Scenario JSON schema for export/import and ensure existing templates or seeds map cleanly onto it.

## Harness Track
- Flesh out generator/verifier packages with scripts to pull the shared scenario JSON and emit PASS/FAIL.
- Add health checks + simple Makefile commands so `docker-compose up` yields deterministic order of operations.
- Plan for HTML report rendering (likely React server components or static template).

## Telemetry + Copy
- Define client-side event dispatcher (post-build) and evaluate storage destination (optional backend vs privacy-preserving client log).
- Draft copy for “honest callouts” and “when to use which” sections so UI and docs share the canonical text.

## Risks to Monitor
- Dual-stack UI (legacy DOM + future React) diverging—set kill date for legacy path.
- Container start-up timing in harness causing flaky verification—add retries/backoff guidance.
- Performance of timeline rendering with >1k events—prototype virtualization approach early.
