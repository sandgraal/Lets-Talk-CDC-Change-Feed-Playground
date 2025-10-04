# Implementation Next Steps

_Tooling status: `npm run build:sim` → `assets/generated/sim-bundle.js`, `npm run build:web` → `assets/generated/ui-shell.js`._

## Immediate Decisions
- **Data contract between DOM + React**: decide how the new React shell exchanges schema/row/event data with the legacy controls during the migration window.
- **State container**: confirm whether we use lightweight emitter only or layer Zustand/RxJS before multi-lane comparator work starts.
- **Scenario authoring**: define a single source of truth for built-in scenarios so simulator, harness, and legacy templates stay in sync.

## Near-Term Build Goals
1. Expand the React shell to support multi-lane comparison and shared timeline metrics.
2. Introduce deterministic clock/tick loop hooks to drive guided tour scripting from the React layer.
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
