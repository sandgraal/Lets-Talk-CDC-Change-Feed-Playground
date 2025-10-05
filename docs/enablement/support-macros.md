# Support Macros

**Comparator Preview Toggle**
```
Hi {{name}},

We just enabled the new comparator experience (`comparator_v2`) for your workspace. Use the "CDC Method Comparator" panel to explore polling/trigger/log differences. If you need to switch back, let us know and we’ll toggle the flag off.

Quick links:
- Scenario matrix: README.md#scenario-matrix
- Playwright smoke: npm run test:e2e (set PLAYWRIGHT_DISABLE=0)
- Harness verification: cd harness && make status

Cheers,
The CDC Playground Team
```

**Comparator Rollback**
```
Hi {{name}},

We’ve temporarily reverted the comparator flag while we address an issue you spotted. Your existing scenarios remain intact; the legacy view is active again. We’ll follow up once the fix rolls out.

Thanks for the quick report!
```
