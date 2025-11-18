# Development Playbook

This playbook documents the day-to-day workflow we follow once you are set up locally. Pair it with `docs/dev-onboarding.md` (tool installation) and `CONTRIBUTING.md` (code of conduct, Hacktoberfest details).

## Branching Strategy
- Create **feature branches off `main`** for all work. Never commit directly to `main`.
- Name branches descriptively: `feature/harness-history`, `bugfix/playwright-timeout`, `docs/update-readme`.
- Keep branches focused on a single issue / change set. Open separate branches when work is unrelated.
- Rebase or merge the latest `main` before opening a PR to reduce conflicts.

## Issue-First Workflow
1. Pick an open GitHub issue (labels `good first issue`, `help wanted`, `hacktoberfest`, etc.) or open a new issue to discuss scope before coding.
2. Reference the issue in your branch/PR using `Fixes #123` so it auto-closes when merged.

## Running Tests Locally

### Unit and Property Tests
Unit tests and property-based simulator tests don't require any special setup:
```bash
npm run test:unit      # Vitest unit suite (88 tests)
npm run test:sim       # Property-based CDC scenario tests
```

### End-to-End Tests (Playwright)
E2E tests require Playwright browsers to be installed. **First-time setup:**
```bash
npx playwright install --with-deps
```

This installs Chromium, Firefox, and WebKit browsers along with system dependencies. On macOS, you may need to allow the installation in System Preferences if prompted.

**Running E2E tests:**
```bash
npm run test:e2e
```

**Common issues:**
- **"Executable doesn't exist"**: Run `npx playwright install --with-deps` again
- **"Browser launch failed"**: Check that system dependencies are installed (Playwright will guide you)
- **Tests timeout**: Increase timeout in `playwright.config.ts` if running on slower hardware
- **Trace artifacts**: Failed tests generate traces in `test-results/`; use `npx playwright show-trace <trace.zip>` to debug

**CI note**: GitHub Actions workflows should run `npx playwright install --with-deps` before `npm run test:e2e` to ensure browsers are available.

## Expectations Before Opening a Pull Request
- **Tests**: run the quick suite locally. At minimum:
  ```bash
  npm run lint:flags
  npm run lint:scenarios
  npm run test:unit
  npm run test:e2e
  ```
  If you have Docker available, run the harness smoke as well (`npm run ci:harness`).
- **Builds**: keep generated bundles in sync with source. Run `npm run check:bundles` before opening a PR to ensure `assets/generated/*` is newer than `src/`, `sim/`, and `web/`.
- **Docs**: update or create documentation for any new behaviour. Examples: README, `docs/harness-guide.md`, `docs/harness-history.md`.
- **Changelog/Notes**: add or update release notes (`docs/enablement/release-notes.md`) when the change is user-facing.

## Pull Request Checklist
- [ ] Branch created from `main` with a descriptive name.
- [ ] Issue linked in the PR description.
- [ ] Summary explains the problem, solution, tests, and any follow-up work.
- [ ] Screenshots or recordings included for UI changes.
- [ ] All required scripts/tests completed and results shared in the PR body.
- [ ] No unrelated files or generated artifacts included.

## After Merge
- Delete the feature branch (local + remote) once the PR is merged.
- If the change affects nightly harness or documentation, ensure corresponding GitHub issues are closed.

## Need Help?
Use the issue thread or the PR conversation to ask questions. We would rather clarify up front than send you back for large revisions.
