# AI Template Kit

## Overview
- `ai/site-config.json` describes the project metadata, commands, and CI workflows that agents can reference.
- `.chatgpt-context.yml` (both at the repository root and mirrored here) summarises the codebase for conversational agents.
- `ai/scripts/bootstrap.mjs` validates configuration and snapshots a summary under `ai/_state/`.
- `ai/scripts/log-agent-run.mjs` records ad-hoc agent executions into timestamped logs under `ai/logs/`.

## Usage notes
1. Run the **AI Agents** workflow from GitHub Actions and choose the `agent` input to log which bundle you executed.
2. Logs and workflow state are archived as build artifacts; local runs will write to the same directories (ignored by Git except for the `.gitkeep` markers).
3. Update `ai/site-config.json` and `.chatgpt-context.yml` whenever commands or documentation links change so downstream agents stay in sync.

## Maintenance
- Keep the Node.js version in the workflows aligned with the version used for the simulator (currently Node 20).
- Clean out historical logs in `ai/logs/` periodically if you run the scripts locally, as they are ignored by Git.
