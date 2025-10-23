# AI Template Kit

This directory contains metadata and helper scripts that power the repository's conversational AI workflows.

## Contents
- `AGENTS.md` – quick-start usage guidance for maintainers and agents.
- `.chatgpt-context.yml` – mirrored project context used by interactive agents.
- `site-config.json` – structured metadata about commands, docs, and CI workflows.
- `scripts/bootstrap.mjs` – sanity-checks configuration and snapshots a summary under `_state/`.
- `scripts/log-agent-run.mjs` – logs workflow or local agent runs into `logs/`.

## GitHub Actions
Three opt-in workflows are available under **GitHub → Actions**:
1. **AI Agents** – installs dependencies, bootstraps the kit, and records which agent bundle you executed.
2. **AI Changelog Sync** – prepares the kit context and logs a changelog-specific run.
3. **AI README Sync** – prepares the kit context and logs a README sync run.

Each workflow uploads `ai/logs/` and `ai/_state/` as artifacts so you can inspect the summaries produced by the helper scripts.

## Local usage
```bash
node ai/scripts/bootstrap.mjs
AI_AGENT_NAME=all node ai/scripts/log-agent-run.mjs
```

The logs and state files are ignored by Git (aside from `.gitkeep` placeholders), so you can experiment locally without committing generated artifacts.
