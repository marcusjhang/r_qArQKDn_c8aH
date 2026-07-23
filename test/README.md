# Tests

Two layers, matching the two testing frameworks configured in `package.json`.

## Unit tests — Vitest (`test/unit/`)

Fast, pure-function tests with no database or browser. They target the
framework-free hiring business logic in `lib/hiring/helpers.ts` (status/stage
placement, stage-array edits, name validation, board filtering + sorting) and
the dependency-injected `getBoard` reader in `lib/hiring/service.ts`.

```bash
bun run test           # run the unit suite once
bun run test:unit      # alias for the above
bun run test:coverage  # run once with a v8 coverage report (text + lcov)
bun run test:watch     # watch mode
```

Config: `vitest.config.ts` (Node environment, `@/` path aliases mirrored from
`tsconfig.json`, `server-only` aliased to `test/stubs/server-only.ts`).

## Coverage per PR — Codecov

`bun run test:coverage` writes an `lcov.info` (plus an HTML report) into the
git-ignored `coverage/` directory using the v8 provider. Coverage is scoped to
the framework-free business logic under `lib/` (UI, generated, schema, and
config files are excluded — see `coverage.include`/`exclude` in
`vitest.config.ts`).

In CI, `.github/workflows/ci.yml` runs this on every pull request and uploads
`coverage/lcov.info` to [Codecov](https://about.codecov.io/). Codecov then posts
a PR comment and two status checks — **project** (whole-codebase %) and
**patch** (coverage of just the lines the PR changed). Both are `informational`
today (they report but don't block merges); tune the gates in `codecov.yml` at
the repo root. Private repos additionally need a `CODECOV_TOKEN` in the repo's
GitHub Actions secrets.

## End-to-end tests — Playwright (`test/e2e/`)

Browser-level tests covering the core happy paths:

- `auth.spec.ts` — the auth gate (unauthenticated redirect + the public login page).
- `candidate-move.spec.ts` — moving a candidate between pipeline stages.
- `candidate-feedback.spec.ts` — leaving interview feedback (rating + note).
- `candidate-chat.spec.ts` — the per-applicant discussion thread + @-mentions.
- `settings.spec.ts` — a settings edit (add a source; add/rename a stage).

The happy-path specs sign in first via the shared `login` / `loginToBoard`
helpers in `test/e2e/helpers.ts`, using the seeded accounts from `db/seed.ts`
(override with `E2E_EMAIL` / `E2E_PASSWORD`). These need a running app
(and therefore a seeded database) plus a one-time browser install:

```bash
bunx playwright install    # once, to fetch browser binaries
bun run test:e2e           # boots the app via playwright.config.ts and runs specs
```

Set `PLAYWRIGHT_BASE_URL` to point at an already-running instance and Playwright
will skip the managed web server.

### Test database isolation

The E2E specs **mutate data** (register accounts, move candidates, write
feedback, edit settings), so when Playwright manages the app itself it must run
against a **dedicated, disposable database** — never your dev `DATABASE_URL`,
which on a team is often a shared database the suite would clobber.

The convention is formalized and enforced:

- Set **`TEST_DATABASE_URL`** to an isolated database. The recommended place is
  a git-ignored **`.env.test`** — `playwright.config.ts` loads it over `.env`
  (via `dotenv`) and exports the resolved URL to the managed server as
  `DATABASE_URL`.
- `playwright.config.ts` resolves the URL through the pure
  `resolveTestDatabaseUrl` helper (`test/db-env.ts`, unit-tested in
  `test/unit/db-env.test.ts`). It **refuses to run** when `TEST_DATABASE_URL` is
  unset or equal to `DATABASE_URL`, so the suite can't silently target the dev
  DB.
- **`ALLOW_SHARED_TEST_DB=1`** is an explicit opt-in escape hatch that lets the
  suite run against `DATABASE_URL` — only for throwaway local sandboxes or
  ephemeral CI containers where the dev and test DB are intentionally the same.
- Point the isolated DB at the schema first: `DATABASE_URL=$TEST_DATABASE_URL
  bun run db:setup` (migrate + seed).

When `PLAYWRIGHT_BASE_URL` is set, Playwright doesn't own the server (or its
database), so this resolution is skipped entirely.

## Adding tests

- Unit: prefer testing pure functions in `lib/hiring/helpers.ts`. When adding
  new business rules, put the decision logic there (not inline in `actions.ts` /
  `store.ts` / components) so it stays testable and shared across layers.
- Injecting data: follow the `BoardReader` pattern in `service.ts` — accept the
  data dependency as an argument with a production default, so tests can pass a
  fake.
- Extract decision logic from framework-bound modules. When a rule lives in a
  file that constructs heavy dependencies at import time (e.g. `lib/auth.ts`
  builds NextAuth + the DB client), lift the pure branching into a dependency-
  free module and unit-test that directly — see `gateDecision` / `resolveUserId`
  in `lib/auth-gate.ts` (tested in `test/unit/auth-gate.test.ts`), which mirrors
  the `decide()` extraction in `lib/rate-limit.ts`.
