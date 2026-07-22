# Testability checklist (Vitest + Playwright, pure logic, injectable I/O)

Applies to `test/**`, `vitest.config.ts`, `playwright.config.ts`, and — even
when no test file is touched — any change to business rules in
`lib/**/helpers.ts`, `lib/registration.ts`, or a
query/action. This is the **Testability health area**: the health analyzer
tracks whether logic can be exercised in isolation, so a change that makes logic
harder to test (or that adds an untested rule) is a finding here.

This checklist has two layers: **framework-agnostic** testability principles,
and the **stack-specific** patterns this repo established (Vitest unit suite,
Playwright smoke, `server-only` stub, injected readers).

## Testable design (framework-agnostic)

- **Separate pure logic from side effects.** Business rules (state/stage
  transitions, filtering, validation, ordering) belong in pure, dependency-free
  functions — no DB, network, React, `server-only`, or `next/*` imports — so they
  run under a unit test with plain inputs and no environment. Flag a rule that is
  inlined in a component render, a server action, or a route handler where it
  can only be reached through I/O.
- **Depend on interfaces, inject the implementation.** Code that must do I/O
  should take its dependency as a parameter (a reader/writer/service interface)
  with the real implementation as the default, so a test can pass a fake. Flag a
  unit of logic that reaches for a module-level singleton (the `db` client, a
  global fetch) it cannot substitute.
- **No import-time side effects.** Importing a module must not open a DB
  connection, read required env, or start a client — otherwise the module can't
  be imported under test without the whole environment. Defer that work into the
  function that needs it (lazy import / call-time construction).
- **Deterministic and isolated.** A test must not depend on wall-clock time,
  random values, ordering of other tests, or shared mutable state. Pass clocks/ids
  in; don't reach for `Date.now()`/`Math.random()` inside the rule.
- **Tests accompany the logic they cover.** A new or changed business rule ships
  with a unit test that exercises it, including the awkward paths (empty input,
  terminal states, guard failures) — not only the happy path. A behaviour-
  preserving refactor must keep the existing suite green. Flag new logic with no
  test, or a diff that deletes/weakens tests without justification.
- **Test at the right altitude.** Prefer fast unit tests over the pure rule;
  reserve end-to-end for a thin smoke of the critical flow (here: auth gating).
  Flag a change that could be a unit test but is only covered (or not covered) by
  a slow E2E path.

## This repo's testing setup

- **Pure logic modules.** `lib/hiring/helpers.ts` holds the sync, framework-free
  hiring rules (status/stage transitions, stage-array edits, next job position,
  the board filter+sort selector, the `HIRED_STAGE` coupling) and
  `lib/registration.ts` owns the account rules. `store.ts`, `actions.ts`, and the
  components **consume** these rather than re-implementing them — that is what
  removed the old client/server duplication (PRs #18, #19, #23). Flag a change
  that re-inlines one of these rules or forks a second copy of it.
- **Injected readers/services.** `getBoardData(reader: BoardReader = drizzleReader)`
  in `lib/hiring/queries.ts` reads through an interface; the Drizzle-backed reader
  is the default and imports `@/lib/db` **lazily** so importing the module doesn't
  require `DATABASE_URL`. Tests pass a fake reader with in-memory rows. Preserve
  this seam — flag a new query that hard-codes `db` where the composition should
  be injectable, or a top-level `import { db }` that forces a live client at
  import time.
- **`server-only` under test.** `vitest.config.ts` aliases `server-only` to
  `test/stubs/server-only.ts` (an inert stub) and mirrors the `@/` path aliases
  from `tsconfig`. A new server module is unit-testable as long as its
  side-effecting deps are lazy/injectable; if you add a new alias or a new
  package that hard-fails at import, mirror it in the Vitest config too.
- **Unit vs E2E layout.** Unit specs in `test/unit/**` (Vitest), the auth smoke
  in `test/e2e/**` (Playwright, managed `webServer`). `test/README.md` documents
  the conventions — keep it in sync when you add a test category.

## Practical gate

- Run **`bun run typecheck`** and **`bun run test`** (Vitest unit suite); both
  must be green. `bun run test:e2e` (Playwright) needs a running app/DB — if you
  can't run it, mark the E2E impact `needs-verification` in the report rather than
  claiming it passed.
- A logic change with no accompanying unit test is at least a `Medium` finding
  (should-fix); a change that breaks the existing suite is `High`.
