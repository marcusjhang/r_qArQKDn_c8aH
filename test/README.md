# Tests

Two layers, matching the two testing frameworks configured in `package.json`.

## Unit tests — Vitest (`test/unit/`)

Fast, pure-function tests with no database or browser. They target the
framework-free hiring business logic in `lib/hiring/helpers.ts` (status/stage
placement, stage-array edits, name validation, board filtering + sorting) and
the dependency-injected `getBoardData` reader in `lib/hiring/queries.ts`.

```bash
bun run test           # run the unit suite once
bun run test:unit      # alias for the above
bun run test:watch     # watch mode
```

Config: `vitest.config.ts` (Node environment, `@/` path aliases mirrored from
`tsconfig.json`, `server-only` aliased to `test/stubs/server-only.ts`).

## End-to-end tests — Playwright (`test/e2e/`)

Browser-level smoke tests (currently the auth gate). These need a running app
(and therefore a database) plus a one-time browser install:

```bash
bunx playwright install    # once, to fetch browser binaries
bun run test:e2e           # boots the app via playwright.config.ts and runs specs
```

Set `PLAYWRIGHT_BASE_URL` to point at an already-running instance and Playwright
will skip the managed web server.

## Adding tests

- Unit: prefer testing pure functions in `lib/hiring/helpers.ts`. When adding
  new business rules, put the decision logic there (not inline in `actions.ts` /
  `store.ts` / components) so it stays testable and shared across layers.
- Injecting data: follow the `BoardReader` pattern in `queries.ts` — accept the
  data dependency as an argument with a production default, so tests can pass a
  fake.
