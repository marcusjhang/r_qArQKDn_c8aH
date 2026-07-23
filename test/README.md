# Tests

Three layers: fast pure **unit** tests and DB-backed **integration** tests (both
Vitest), plus browser **e2e** tests (Playwright).

## Test environment

Environment inputs are resolved once, into a typed object, by
[`test/env.ts`](./env.ts) — tests import structured values from there instead of
reading or mutating the global `process.env` (shared mutable state makes suites
order-dependent). `readTestEnv` is also exported as a pure function so a test can
model a specific environment by passing a plain object. The same
structured-override principle applies elsewhere: e.g. `createDefaultStore(env)`
in `lib/rate-limit.ts` takes an env argument so the store-selection logic is
tested without touching `process.env`.

Database selection precedence (integration + e2e): `TEST_DATABASE_URL` (a
dedicated, throwaway database — **preferred**) → `DATABASE_URL` (dev fallback).
Set `TEST_DATABASE_URL` for any run that must not touch development data.

## Unit tests — Vitest (`test/unit/`)

Fast, pure-function tests with no database or browser. They target the
framework-free hiring business logic in `lib/hiring/helpers.ts` (status/stage
placement, stage-array edits, name validation, board filtering + sorting) and
the dependency-injected `getBoard` reader in `lib/hiring/service.ts`.

Security policy is unit-tested here too, via the framework-free
[`lib/auth-policy.ts`](../lib/auth-policy.ts) (the auth decisions were extracted
out of `lib/auth.ts`, which can't be imported outside a Next runtime). See
`test/unit/auth-gate.test.ts`: the whole-app login gate, the forced first-login
`mustChangePassword` confinement, the middleware route matcher, the
Server-Action `resolveUserId` guard, and anomalous credentials-input rejection —
i.e. the authorization/edge cases from `SECURITY.md`, not just the happy path.

```bash
bun run test           # run the unit suite once
bun run test:unit      # alias for the above
bun run test:coverage  # run once with a v8 coverage report (text + lcov)
bun run test:watch     # watch mode
```

Config: `vitest.config.ts` (Node environment, `@/` path aliases mirrored from
`tsconfig.json`, `server-only` aliased to `test/stubs/server-only.ts`).

## Coverage

`bun run test:coverage` runs the suite with the v8 provider and prints a
coverage table. Coverage is scoped to the framework-free business logic under
`lib/` (UI, generated, schema, and config files are excluded — see
`coverage.include`/`exclude` in `vitest.config.ts`).

In CI, `.github/workflows/ci.yml` runs it on every pull request and push to
`main`, so the coverage report is visible in the job log. It is **reported, not
gated** — to enforce a floor, add a `coverage.thresholds` block to
`vitest.config.ts`.

## Integration tests — Vitest (`test/integration/`)

DB-backed tests that talk to a **real Postgres**, run explicitly:

```bash
bun run test:integration   # vitest --config vitest.integration.config.ts
```

They use the harness in [`test/integration/helpers/db.ts`](./integration/helpers/db.ts),
which builds an isolated client via `createDb` (`lib/db.ts`) against the resolved
test database and provides two isolation strategies:

- **`withRollback(fn)`** — runs `fn` inside a transaction that is **always rolled
  back**, so nothing it writes is ever committed. This is the default: it's safe
  even against the shared dev `DATABASE_URL`, giving each test a clean, ephemeral
  slice of the database.
- **`resetTables(tables)`** — `TRUNCATE … RESTART IDENTITY CASCADE` for tests
  needing committed state. Destructive, so it **refuses to run** unless a
  dedicated `TEST_DATABASE_URL` is configured — it can never wipe a database the
  harness merely fell back to.

When no database is reachable, the suites `describe.skipIf(!hasTestDatabase)`
themselves, so the layer is safe to run anywhere (e.g. a local checkout with no
`.env`). In CI the `integration` job in `.github/workflows/ci.yml` provisions a
throwaway Postgres service and sets `TEST_DATABASE_URL` to it, so the suite runs
for real (and, with a dedicated test database, the destructive `resetTables`
path is exercised too) and a failure blocks the merge. Current specs cover the
harness's own isolation guarantee, the `allowed_emails` unique constraint, and
the atomic `rate_limit_hit()` SQL limiter behind `PostgresRateLimitStore` (the
production rate-limiting path — see `SECURITY.md`).

## End-to-end tests — Playwright (`test/e2e/`)

Browser-level tests covering the core happy paths:

- `auth.spec.ts` — the auth gate (unauthenticated redirect + the public login page).
- `candidate-move.spec.ts` — moving a candidate between pipeline stages.
- `candidate-feedback.spec.ts` — leaving interview feedback (rating + note).
- `candidate-chat.spec.ts` — the per-applicant discussion thread + @-mentions.
- `settings.spec.ts` — a settings edit (add a source; add/rename a stage).

Authentication happens **once** in the Playwright `setup` project
(`test/e2e/global.setup.ts`): it signs in with a seeded account, completes the
forced first-login password change (`mustChangePassword`), and saves the
signed-in cookies. The authenticated `chromium` project reuses them via
`storageState`, so the happy-path specs start already signed in (the `login` /
`loginToBoard` helpers in `test/e2e/helpers.ts` just confirm the session) and
never re-drive the login form — which keeps a parallel run from tripping the
per-IP login rate limiter (`lib/rate-limit.ts`). The `auth.spec.ts` gate tests
run as an unauthenticated `guest` project instead. Credentials come from the
seeded accounts in `db/seed.ts` (override with `E2E_EMAIL` / `E2E_PASSWORD`).
Specs run serially within a file (`fullyParallel: false`) because each file
drives one shared seeded candidate; files still parallelize across workers.

These need a running app (and therefore a seeded database) plus a one-time
browser install:

```bash
bunx playwright install    # once, to fetch browser binaries
bun run test:e2e           # boots the app via playwright.config.ts and runs specs
```

Set `PLAYWRIGHT_BASE_URL` to point at an already-running instance and Playwright
will skip the managed web server. When Playwright boots the server itself and
`TEST_DATABASE_URL` is set, the managed app is pointed at that dedicated database
(via `webServer.env`) so e2e runs never mutate development data. Because the
managed server runs a production build, `webServer.env` also sets
`AUTH_TRUST_HOST` so Auth.js trusts the localhost e2e origin.

In CI the `e2e` job in `.github/workflows/ci.yml` provisions a throwaway Postgres
service, migrates + seeds it, installs the Chromium browser, and runs the suite
against a fresh production build — so e2e regressions block the merge.

## Adding tests

- Unit: prefer testing pure functions in `lib/hiring/helpers.ts`. When adding
  new business rules, put the decision logic there (not inline in `actions.ts` /
  `store.ts` / components) so it stays testable and shared across layers.
- Injecting data: follow the `BoardReader` pattern in `service.ts` — accept the
  data dependency as an argument with a production default, so tests can pass a
  fake. For environment inputs, take a structured override argument defaulting to
  `process.env` (as `createDefaultStore(env)` does) rather than reading globals.
- Security/policy: put a decision that must be tested outside a Next runtime in a
  framework-free module (like `lib/auth-policy.ts`) and have the Next glue adapt
  it, so the decision is unit-testable without booting middleware/next-auth.
- Integration (needs a DB): wrap the body in `withRollback` so it leaves no
  state behind, and gate the suite with `describe.skipIf(!hasTestDatabase)`.
