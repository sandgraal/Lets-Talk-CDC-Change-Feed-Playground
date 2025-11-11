# Support Macros

We do not send external comms anymore, but keeping a couple of snippets helps us leave quick notes in commit messages, PR descriptions, or shared logs when we toggle `comparator_v2` during soak.

**Comparator Preview Toggle**
```
Heads-up: flipped `comparator_v2` on for today’s soak. Watch the comparator diff overlays, event log filters, and metrics strip; log quirks in docs/issues/comparator-v2-rollout.md.

Quick refs:
- Scenario matrix: README.md#scenario-matrix
- Playwright smoke: npm run test:e2e (set PLAYWRIGHT_DISABLE=0)
- Harness verification: cd harness && make status
```

**Comparator Rollback**
```
Rolled `comparator_v2` back to legacy while we chase an issue. Leave the reproduction + fix plan in docs/issues/comparator-v2-rollout.md so we remember to flip it forward again.
```
