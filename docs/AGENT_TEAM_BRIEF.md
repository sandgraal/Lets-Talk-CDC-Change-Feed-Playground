# Agent Team Brief — The Interactive CDC Simulator

**Date:** 2026-06-07
**Prepared by:** state evaluation + critical-bug fix pass
**North star:** The best **hands-on, in-browser CDC simulator** — the "try it live" companion that makes change data capture *tangible*. Polling vs trigger vs log, lag, ordering, deletes, schema evolution, multi-table atomicity — shown, not just described.

This brief is the entry point for a team of agents. Read it first — especially §0 (Scope & boundaries), which exists to stop this repo from duplicating its sibling.

---

## 0. Scope & boundaries — READ THIS FIRST

There are **two sibling repos** in this CDC family. They must not duplicate each other.

| Repo | Role | Owns |
| --- | --- | --- |
| **`letstalkcdc/`** (`~/Websites/letstalkcdc`, Eleventy site → `sandgraal.github.io/letstalkcdc/`) | **The education hub** | "What is CDC?", concepts, beginner on-ramp, learning paths, glossary, vendor-agnostic explanations + stack mappings (Debezium/Kafka/Matillion/Snowflake…), written labs, a getting-started Docker sandbox |
| **`Lets-Talk-CDC-Change-Feed-Playground/`** (this repo) | **The interactive simulator** | The in-browser method comparator + change feed playground, and the *failure-aware* Docker reference pipeline (`scenarios/01-canonical-reference/`) |

**This repo is a standalone tool that is lightly self-explanatory.** It carries only the *minimum* context a user needs to operate the simulator, and **defers all deep teaching to `letstalkcdc` via links** rather than re-authoring it.

### Do NOT build here (it belongs to `letstalkcdc` — link to it instead)
- ❌ A "What is CDC?" primer / motivation essay
- ❌ A standalone glossary of CDC terms
- ❌ Beginner→advanced *learning paths* or curricula
- ❌ Vendor/stack mapping guides (Debezium tuning, Snowflake/S3 sinks, etc.)
- ❌ Written conceptual labs on exactly-once, schema registry, cross-DB CDC, etc.

When the simulator needs to explain a term, **one inline tooltip + a deep link to the matching `letstalkcdc` page** — not a new doc in this repo.

### DO build here (this is the playground's unique value)
- ✅ The interactive simulator UX (comparator + change feed playground) — make it clearer, smoother, more revealing
- ✅ The *failure-aware* Docker reference pipeline — distinct from `letstalkcdc`'s getting-started sandbox (this one intentionally triggers failure modes + verifies source vs sink)
- ✅ Reliability, performance, and deploy correctness of the tool
- ✅ Wayfinding: send users *to* `letstalkcdc` for concepts, and make sure `letstalkcdc` can link *here* for "try it live"

> The Docker overlap is intentional and resolved: keep this repo's `scenarios/01-canonical-reference/` as the **failure-aware reference pipeline**. Cross-link it with `letstalkcdc`'s getting-started sandbox so their different purposes are obvious; do not merge them.

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

**The engineering foundation is solid.** The gaps are (a) one class of deploy-time bug that tests didn't cover, now fixed, and (b) sharpening the *tool* (not adding education content).

---

## 2. What this pass fixed (start from a working baseline)

Two independent breakages made the two flagship interactive tools fail **on the deployed/static-hosted site**, while every test stayed green.

### Fix A — comparator + playground broke on HTTP hosting (blob-import bug)
- **Symptom:** `#simShellRoot` stuck on "Simulator preview unavailable"; `#changefeedPlaygroundRoot` stuck on "Preparing…".
- **Root cause:** `index.html` hardcodes `window.APPWRITE_CFG.assetHeaders`, which forced the loaders (`assets/*-loader.js`) to fetch bundles as text and `import()` them via a **`blob:` URL**. The web bundles are code-split — `ui-shell.js` and `changefeed-playground.js` both `import … from "./event-log-widget.js"` — and a relative specifier cannot resolve against a non-hierarchical `blob:` base. → `TypeError: Failed to resolve module specifier "./event-log-widget.js"`.
- **Why tests missed it:** unit/e2e load bundles directly as modules or over `file://`; the header/blob path only activates on `http(s)://`. **The deployed path had zero coverage.**
- **Fix:** all four loaders now try a native `import()` first and only fall back to the header/blob fetch if native import actually throws.

### Fix B — Change Feed Playground was never booted
- **Root cause:** `changefeed-playground-loader.js` only *exposes* a `.load()` handle; nothing ever called it (compare: the event-log widget is booted from `app.js`). So the bundle was never imported.
- **Fix:** added an idle-time bootstrap in `index.html` that calls `window.__LetstalkCdcChangefeedPlayground.load()` (the bundle self-mounts on import), with a diagnostic warning if the loader handle is absent.

### Regression guard added
- `tests/e2e/static-hosting-smoke.spec.mjs` — spins up a real HTTP static server (reproducing the hardcoded-Appwrite-headers condition) and asserts both widgets mount with no loader warnings. **This is the test the project was missing.** Keep it green.

> ⚠️ **Trap:** any change that re-introduces a code-split shared chunk imported through the blob path, or that strips the changefeed bootstrap, silently breaks the live site again while `file://` specs pass. The smoke test is the canary — do not delete or weaken it.

---

## 3. Workstreams (parallelizable — one agent or small pod each)

Priority order: **W1 → (W2 ∥ W3) → W4.** All are scoped to the playground's lane per §0 — none of them re-author `letstalkcdc`'s education content.

### W1 — Reliability & deploy correctness (mostly done — verify + extend)
- [ ] **Verify the fix on the real deploy target.** Run `npm run package:appwrite`, deploy to Appwrite Sites, confirm both widgets mount live. Repeat for any GitHub Pages mirror.
- [ ] **Run the failure-aware Docker pipeline live** (`cd scenarios/01-canonical-reference && make preflight && make up && make status`). Capture actual vs `docs/expected-behavior.md`; file any drift.
- [ ] **Reconsider the hardcoded `APPWRITE_CFG.assetHeaders`** in `index.html` — is `X-Appwrite-Project` even required to fetch public static assets? If not, removing it simplifies the loader path. Acceptance: documented decision + smoke test still green.
- [ ] Wire the new smoke spec into `ci:preflight` (it already runs under `test:e2e`).

### W2 — Wayfinding & lightweight context (NOT content authoring)
The goal is the opposite of writing a curriculum: keep the tool self-explanatory with the *least* prose, and route users to `letstalkcdc` for everything deeper.
- [ ] **Add a one-line "what this is" framing** in the hero: this is the *interactive simulator* for CDC; for concepts/learning, link out to `letstalkcdc`.
- [ ] **Wire existing tooltips (the `ff_walkthrough` flag) to deep-link** to the matching `letstalkcdc` concept pages instead of re-explaining terms here. One sentence + a link, not a glossary.
- [ ] **Establish the cross-link contract with `letstalkcdc`** (coordinate with that repo): it links *here* as "try it live"; this links *there* for concepts. Pick a stable URL/anchor scheme.
- [ ] **Audit existing docs in this repo for scope creep** — `docs/` here already has cheat-sheets, playbooks, lab recipes, evaluation checklists. Decide per-doc: keep (tool-usage / failure-pipeline reference) or migrate to `letstalkcdc` (general CDC education). Err toward migrating education out.
- **Acceptance:** a user can operate the simulator from inline context alone, and every "learn more" path leaves this repo for `letstalkcdc` — no duplicated explanations.

### W3 — Simulator UX / information architecture
This is the playground's core craft. Make the tool itself clearer.
- [ ] **Disambiguate the two simulators.** The page has both a "Change Feed Playground" (simple 3-lane) and a "CDC Method Comparator" (dense, multi-feature) with no signpost for which to use first. Decide: tutorial-then-tool, or merge. Add in-context framing either way.
- [ ] **Difficulty tags on scenarios** (`assets/shared-scenarios.js`) surfaced in the gallery filter, so a user doesn't open "Orders + Items Transactions" first.
- [ ] **In-comparator first-run guidance** — explain lanes, lag, ordering, write amplification *as they appear* (reuse `ff_walkthrough`), with deep links out for the underlying concepts.
- [ ] **Replace bare "Preparing…/unavailable" placeholders** with real loading states + actionable fallbacks.
- [ ] **Mobile/responsive pass** on the 3-lane views.

### W4 — Failure-aware Docker pipeline polish (the distinct backend asset)
Keep this focused on what makes it *different* from `letstalkcdc`'s sandbox: failure modes + verification.
- [ ] Live-verify each failure mode (restart, lag, schema evolution, duplicate, backfill) against `docs/expected-behavior.md`.
- [ ] Turn each failure mode's recovery into a tight runbook checklist (tool reference, not a CDC lesson).
- [ ] Cross-link its README with `letstalkcdc`'s getting-started sandbox so the "getting started" vs "failure-aware reference" split is obvious.

### W5 — Repo hygiene & docs truth (quick wins)
- [ ] **Delete `path/to/`** — two accidental 1-line placeholder files committed by mistake.
- [ ] **Reconcile version drift** — `docs/next-steps.md` and `docs/IMPLEMENTATION_PLAN.md` still reference a "v1.0" that contradicts the `0.1.0` snapshot.
- [ ] **Add `docs/README.md` index** mapping the remaining (tool-scoped) docs.
- [ ] Update `README.md` "Current Status" to reflect this pass (E2E green, loader bug fixed) — and add a prominent link to `letstalkcdc` as the education hub.

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

**Golden rule:** for anything touching the loaders, the bundle split, or `index.html` boot, verify over **HTTP** (not `file://`, not the vite dev server) — that's the only way to exercise the deployed path. The smoke test does this; so should you.

---

## 5. Key file map

- `index.html` — single-page entry; hero, vanilla workspace, two React mount points (`#changefeedPlaygroundRoot`, `#simShellRoot`), feature flags, loader bootstraps.
- `assets/*-loader.js` — hand-authored bundle loaders (NOT built; not bundle inputs).
- `assets/app.js` — vanilla workspace logic + widget orchestration (~5,300 LOC).
- `assets/shared-scenarios.js` — single source for the scenario gallery + comparator demos.
- `web/` — React entries (`main.tsx` → comparator, `changefeed.tsx` → playground, `event-log-widget.tsx`).
- `src/` — engine + domain + UI components (the real logic; `web/` re-exports).
- `scenarios/01-canonical-reference/` — the failure-aware Docker reference pipeline.
- `docs/` — tool-usage + failure-pipeline reference (per §0/W2, migrate general CDC education to `letstalkcdc`).
- **Sibling:** `~/Websites/letstalkcdc` — the education hub. Coordinate cross-links; don't duplicate its content.
