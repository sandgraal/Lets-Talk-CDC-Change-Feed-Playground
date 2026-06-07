# Agent Team Brief — Make This the Best Place to Learn CDC

**Date:** 2026-06-07
**Prepared by:** state evaluation + critical-bug fix pass
**North star:** A **newcomer to change data capture** lands here knowing nothing and leaves understanding what CDC is, why it matters, and how polling / trigger / log / outbox differ — by *doing*, not just reading.

This brief is the entry point for a team of agents. Read it first. It captures the verified state of the repo, what was just fixed, and a prioritized, parallelizable backlog with acceptance criteria and known traps.

---

## 1. Verified state (empirical, this pass)

Everything below was actually run, not inferred from docs.

| Area | Status | Notes |
| --- | --- | --- |
| `npm run build` | ✅ | sim + web bundles build clean |
| `npm run test:unit` | ✅ | 95/95 pass |
| `npm run test:sim` (property) | ✅ | 24/24 pass |
| `npm run test:e2e` | ✅ | 8/8 pass (was "broken" only because Playwright browsers weren't installed — run `npx playwright install`) |
| `lint:flags`, `lint:scenarios`, `check:bundles` | ✅ | green on a clean tree |
| `npm audit --omit=dev` | ✅ | 0 prod vulnerabilities (the 10 reported are all dev-only) |
| Canonical Docker scenario (`scenarios/01-canonical-reference/`) | ✅ built, ⚠️ unverified live | ~3,700 LOC, real images, working verifier/sink/dashboard/failure-injectors. Needs a live `make up` run (Docker required) to confirm end-to-end. |

**The engineering foundation is solid.** The gaps are (a) one class of deploy-time bug that tests didn't cover, now fixed, and (b) the *learning experience* itself.

---

## 2. What this pass fixed (start from a working baseline)

Two independent breakages made the two flagship interactive tools fail **on the deployed/static-hosted site**, while every test stayed green.

### Fix A — comparator + playground broke on HTTP hosting (blob-import bug)
- **Symptom:** `#simShellRoot` stuck on "Simulator preview unavailable"; `#changefeedPlaygroundRoot` stuck on "Preparing…".
- **Root cause:** `index.html` hardcodes `window.APPWRITE_CFG.assetHeaders`, which forced the loaders (`assets/*-loader.js`) to fetch bundles as text and `import()` them via a **`blob:` URL**. The web bundles are code-split — `ui-shell.js` and `changefeed-playground.js` both `import … from "./event-log-widget.js"` — and a relative specifier cannot resolve against a non-hierarchical `blob:` base. → `TypeError: Failed to resolve module specifier "./event-log-widget.js"`.
- **Why tests missed it:** unit/e2e load bundles directly as modules or over `file://`; the header/blob path only activates on `http(s)://`. **The deployed path had zero coverage.**
- **Fix:** all four loaders (`ui-shell-loader.js`, `changefeed-playground-loader.js`, `event-log-loader.js`, `sim-loader.js`) now try a native `import()` first and only fall back to the header/blob fetch if native import actually throws.

### Fix B — Change Feed Playground was never booted
- **Symptom:** even with Fix A, `#changefeedPlaygroundRoot` stayed on "Preparing…".
- **Root cause:** `changefeed-playground-loader.js` only *exposes* a `.load()` handle; nothing in `index.html` or `assets/app.js` ever called it (compare: the event-log widget is booted from `app.js`). So the bundle was never imported.
- **Fix:** added an idle-time bootstrap in `index.html` that calls `window.__LetstalkCdcChangefeedPlayground.load()` (the bundle self-mounts on import).

### Regression guard added
- `tests/e2e/static-hosting-smoke.spec.mjs` — spins up a real HTTP static server (reproducing the hardcoded-Appwrite-headers condition) and asserts both widgets mount with no loader warnings. **This is the test the project was missing.** Keep it green.

> ⚠️ **Trap for the team:** any change that re-introduces a code-split shared chunk imported through the blob path, or that strips the changefeed bootstrap, will silently break the live site again while `file://` specs pass. The smoke test is the canary — do not delete or weaken it.

---

## 3. Workstreams (parallelizable — one agent or small pod each)

Priority order: **W1 → (W2 ∥ W3 ∥ W5) → W4.** W1 is mostly done; verify and extend it. The rest are independent and can run concurrently.

### W1 — Reliability & deploy correctness (mostly done — verify + extend)
- [ ] **Verify the fix on the real deploy target.** Run `npm run package:appwrite`, deploy to Appwrite Sites, confirm both widgets mount in the live browser. Repeat for the GitHub Pages mirror (`girhun.github.io/...`).
- [ ] **Run the canonical Docker scenario live** (`cd scenarios/01-canonical-reference && make preflight && make up && make status`). Capture what actually happens vs `docs/expected-behavior.md`. File any drift.
- [ ] **Reconsider the hardcoded `APPWRITE_CFG.assetHeaders`** in `index.html` — is the `X-Appwrite-Project` header even required to fetch public static assets? If not, removing it simplifies the loader path entirely. Acceptance: documented decision + smoke test still green.
- [ ] Wire the new smoke spec into `ci:preflight` (it already runs under `test:e2e`).

### W2 — Newcomer on-ramp (highest learning leverage; audience = beginners)
There is **no path for someone who doesn't already know CDC.** Build it.
- [ ] **`docs/what-is-cdc.md`** — plain-language "Why CDC?": use cases (analytics, event sourcing, microservices, cache invalidation), CDC vs batch ELT, when *not* to use it. Link from the top of `README.md` and the site hero.
- [ ] **`docs/glossary.md`** — define every term the UI/docs throw at learners: LSN, WAL, binlog, offset, slot, snapshot, tombstone, soft delete, apply-on-commit, commit drift, write amplification, dedupe, outbox. Cross-link from docs and wire into the existing `ff_walkthrough` tooltip system.
- [ ] **`docs/learning-path.md`** — an explicit beginner → intermediate → advanced sequence that threads the existing strong assets (`cdc-method-cheatsheet.md` → `cdc-demo-playbook.md` → `cdc-lab-recipes.md` → `canonical-scenario.md`).
- [ ] **A "What is CDC?" moment in the site hero** (`index.html`) — one screen that orients a first-timer before they hit a pile of controls.
- **Acceptance:** a reader who has never heard of CDC can follow a single linked trail from the README to running the canonical scenario without getting stuck on undefined jargon.

### W3 — UX / information architecture
- [ ] **Disambiguate the two simulators.** The page has both a "Change Feed Playground" (simple 3-lane) and a "CDC Method Comparator" (dense, multi-feature) with no signpost for which to use first. Decide: tutorial-then-tool, or merge. Add in-context framing either way.
- [ ] **Difficulty tags on scenarios** (`assets/shared-scenarios.js`) — Beginner / Intermediate / Advanced, surfaced in the gallery filter, so a learner doesn't open "Orders + Items Transactions" first.
- [ ] **In-comparator onboarding** — the comparator drops users straight into scenario selection with no explanation of lanes, lag, ordering, or write amplification. Add a first-run guided overlay (the `ff_walkthrough` flag already exists).
- [ ] **Replace bare "Preparing…/unavailable" placeholders** with real loading states + actionable fallbacks.
- [ ] **Mobile/responsive pass** on the 3-lane views.

### W4 — Content depth (after the on-ramp exists)
Strong hands-on content already exists (demo playbook, lab recipes, canonical scenario). Fill the topic gaps:
- [ ] Exactly-once vs at-least-once (currently only mentioned in passing).
- [ ] Schema registry & compatibility modes (hands-on, not just a warning).
- [ ] Sink design patterns (upsert semantics, dedupe strategies, idempotency) as a standalone doc.
- [ ] Cross-database CDC (Postgres vs MySQL vs Mongo) — at least a comparison.
- [ ] Production runbooks: turn each canonical failure mode's recovery into a standalone checklist.

### W5 — Repo hygiene & docs truth (quick wins)
- [ ] **Delete `path/to/`** — two accidental 1-line placeholder files (`README.md`, `release-notes.md`) committed by mistake.
- [ ] **Reconcile version drift** — `docs/next-steps.md` and `docs/IMPLEMENTATION_PLAN.md` still reference a "v1.0" that contradicts the `0.1.0` snapshot. Pick one source of truth.
- [ ] **Add `docs/README.md` index** — 20+ docs across `docs/`, `docs/enablement/`, `docs/issues/` with no map. Index them by role/use-case.
- [ ] Update `README.md` "Current Status" and the assessment docs to reflect this pass (E2E green, loader bug fixed).

---

## 4. Build / test / run cheat-sheet for agents

```bash
npm install
npm run build            # sim + web bundles → assets/generated/
npm run test:unit        # 95 tests (vitest)
npm run test:sim         # 24 property invariants
npx playwright install   # one-time, before e2e
npm run test:e2e         # 8 specs incl. static-hosting smoke
npm run lint:flags lint:scenarios check:bundles

# See it for real (the bug only shows over HTTP, not file://):
python3 -m http.server 4179   # then open http://localhost:4179/index.html
```

**Golden rule:** for anything touching the loaders, the bundle split, or `index.html` boot, verify over **HTTP** (not `file://` and not the vite dev server) — that's the only way to exercise the deployed path. The smoke test does this; so should you.

---

## 5. Key file map

- `index.html` — single-page entry; hero, vanilla workspace, two React mount points (`#changefeedPlaygroundRoot`, `#simShellRoot`), feature flags, loader bootstraps.
- `assets/*-loader.js` — hand-authored bundle loaders (NOT built; not bundle inputs).
- `assets/app.js` — vanilla workspace logic + widget orchestration (~5,300 LOC).
- `assets/shared-scenarios.js` — single source for the scenario gallery + comparator demos.
- `web/` — React entries (`main.tsx` → comparator, `changefeed.tsx` → playground, `event-log-widget.tsx`).
- `src/` — engine + domain + UI components (the real logic; `web/` re-exports).
- `scenarios/01-canonical-reference/` — the Docker "Failure-Aware CDC Reference Pipeline" (the authoritative learning centerpiece).
- `docs/` — learning content (strong on hands-on, thin on newcomer on-ramp).
