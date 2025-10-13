# Developer Onboarding

## Install & bootstrap
```bash
npm install
```

## Common workflows
- Run the React comparator + simulator side-by-side: `npm run dev:all` (spawns `npm run dev:sim` and `npm run dev:web` in parallel).
- Focus on the comparator shell only: `npm run dev:web` (ensure you have a fresh `npm run build:sim` first).
- Property-test the engines: `npm run test:sim`.
- Type-check and unit test the shared engine/ui packages: `npx tsc --noEmit` and `npm run test:unit` (see `/src/test`).
- Smoke the Playwright flows, including the apply-on-commit transaction scenario: `npm run test:e2e`.
- Build artefacts for the playground: `npm run build`.

## Component stories
We use [Ladle](https://ladle.dev/) to iterate on UI primitives:
```bash
npm run ladle
```
Stories live under `web/stories/`—add new ones alongside components so copywriters and designers can experiment without running the full shell.

## Harness quickstart
See `docs/harness-guide.md` for Make targets that bring up Postgres, Debezium, and the verifier. Useful for CDC end-to-end debugging.
