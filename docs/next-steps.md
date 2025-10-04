# Implementation Next Steps

_Tooling status: Vite (library mode) builds `sim/bundle.ts` into `assets/generated/sim-bundle.js` via `npm run build:sim`._

## Immediate Decisions
- **Legacy ↔ Vite boundary**: define which parts of `assets/app.js` migrate first and how data flows between vanilla DOM state and the Vite-powered simulator bundle while React work ramps.
- **State container**: confirm whether we use lightweight emitter only or layer Zustand/RxJS before multi-lane comparator work starts.
- **React integration strategy**: outline migration path from the current DOM-driven UI to React components, including carve-out plan for coexisting approaches during the transition.

## Near-Term Build Goals
1. Wire ScenarioRunner + engines into a thin React shell (served via Vite) that renders a single-lane simulator using stub metrics, then hydrate it into the existing page.
2. Introduce deterministic clock/tick loop with pause/resume to support guided tour scripting.
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
