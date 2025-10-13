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

## Expectations Before Opening a Pull Request
- **Tests**: run the quick suite locally. At minimum:
  ```bash
  npm run lint:scenarios
  npm run test:unit
  npm run test:e2e
  ```
  If you have Docker available, run the harness smoke as well (`npm run ci:harness`).
- **Builds**: only regenerate generated bundles when the change requires it (see README “Deploy” sections).
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
