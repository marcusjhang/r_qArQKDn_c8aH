# Backend checklist (server actions + Drizzle + zod + next-auth)

Applies to `lib/**/actions.ts`, `lib/**/queries.ts`, `app/**/route.ts`,
`app/**/actions.ts`, `middleware.ts`, `lib/auth.ts`, `lib/db.ts`, `db/**`,
`drizzle/**`.

## Server actions — the single write path

- Every mutation is a server action (`'use server'`). Flag a write performed
  outside an action (e.g. a `route.ts` doing an ad-hoc DB write that the action
  layer should own).
- **Validate every input with zod at the boundary.** Each action's raw args must
  be parsed through the validators in `lib/**/schemas.ts` (`zId.parse`,
  `candidateInsertSchema.parse`, …) before touching the DB. Flag any action that
  trusts a raw `number`/`string` argument. A parse failure should throw so the
  client store's `resync()` reverts the optimistic change — don't swallow it.
- **Revalidate after a mutation.** DB-backed pages are cached; an action that
  changes data must call `revalidatePath('/')` (or the affected path). Flag a
  mutation with no revalidation — the UI will go stale after a resync.
- **Multi-statement invariants use a transaction.** When an update must stay
  consistent across tables/rows (e.g. `renameStage` updates the job's stage
  array _and_ re-points candidates), wrap it in `db.transaction`. Flag
  co-dependent writes done as separate awaited statements.
- Enforce domain caps/guards server-side (e.g. `MAX_FAVORITES`, `stageDeletable`,
  `validateStageName`) — the server is authoritative even if the client also
  checks. Return early (`return`/`return null`) on guard failure rather than
  throwing when the failure is expected/benign.

## Queries — reads

- Read modules are `import 'server-only'` (see `lib/hiring/queries.ts`). Flag a
  query module missing it, or a query imported into a client component.
- Use Drizzle's relational query API with a `columns` allowlist so the result is
  exactly the UI type (`HiringState`) — **no casts, no manual grouping, no
  field renames**. Flag `as` casts used to force a query result into a type.
- Parallelize independent reads with `Promise.all` (as `getBoardData` does)
  rather than awaiting sequentially.
- Watch for N+1s: prefer a single relational query with `with:` over per-row
  follow-up queries in a loop.

## Drizzle / DB correctness

- Filters use the Drizzle helpers (`eq`, `and`, `ne`, `sql`) with bound
  parameters — never string-interpolate user input into `sql``. Flag raw string
  concatenation into a query.
- FK `onDelete` behaviour is intentional (the schema uses `cascade` for
  candidates/feedback). A new relation should declare its delete behaviour.
- Schema changes must ship a generated migration and a maintained seed — see
  **Schema changes: migration + seed** below.
- Prefer DB-level constraints for real invariants (e.g. the `rating` CHECK,
  `notNull`, `unique`) over app-only checks.

## Schema changes: migration + seed

The database is **seeded**, not just migrated: `bun run db:setup` runs
`db:migrate` then `db:seed`. The seed has two halves — the runner `db/seed.ts`
(insert order, idempotency) and the typed data in `lib/hiring/seed.ts`
(`SEED_JOBS`, `SEED_CANDIDATES`). A change to `lib/schema.ts` is incomplete
until **all three** agree. When reviewing any `lib/schema.ts` change, check:

- **Migration present.** The schema change has a matching generated migration in
  `drizzle/**` (`bun run db:generate`). Flag a schema edit with no migration in
  the diff.
- **Seed still inserts.** Any column the seeder writes must still be satisfiable:
  - A new `notNull` column with no default breaks every insert in `db/seed.ts` —
    the change must add a DB default, backfill in the migration, **or** add the
    value to the seed inserts / `SEED_*` data.
  - A renamed/removed column or table must be renamed/removed in both `db/seed.ts`
    and `lib/hiring/seed.ts`. (`tsc` catches many of these because the seed data
    is typed against the schema-derived types — but not raw
    `.values({...})` keys, so read them.)
  - A changed enum/value-set (see type-management) must be reflected in the
    `SEED_*` data; values there are typed as `Status`/`RatingValue`, so a removed
    value fails `tsc`, but a _new required_ one won't — confirm the seed still
    represents the intended states.
- **New table → seed it if it needs sample data.** Add inserts in **FK-safe
  order** (the runner does users → allowlist → jobs → candidates → feedback);
  a child row inserted before its parent will fail.
- **Idempotency preserved.** `db:setup` is re-run on every sandbox boot, so seed
  steps must be safely repeatable — follow the existing patterns
  (`onConflictDoNothing`, create-or-update, or skip-if-rows-exist). Flag a new
  seed insert that would throw or duplicate on a second run.
- **Practical gate:** after a schema change, `bun run db:setup` must still
  complete cleanly. If you can't run it, at minimum flag the seed as
  needs-verification in the report rather than assuming it's fine.

## Auth & API routes

- The app is gated by the `authorized` callback in `lib/auth.ts` via
  `middleware.ts`; only `/login` is public. If a new route must be public, the
  middleware matcher / `authorized` logic must be updated deliberately — flag a
  new public surface that wasn't intended.
- `app/api/**` route handlers must validate input, normalize where the rest of
  the app does (e.g. `normalizeEmail`), check the allowlist / authz explicitly,
  and return correct status codes (400/401/403/409/500) — see
  `app/api/register/route.ts`.
- Passwords: hash with bcrypt (cost ≥ 12), compare with `compare`, never log or
  return the hash. Flag any plaintext-password handling.
- Never leak secrets: no secrets in responses, logs, or client-reachable code.
  New env vars belong in `.env.example` (without real values).

## General

- Errors: don't swallow exceptions silently except where the pattern requires it
  (action throws → store resyncs). API handlers catch and return a generic 500
  without leaking internals.
- `strict` TypeScript: no `any`, no non-null `!` to paper over a real nullable,
  handle the `[row] = await …` "no row" case (`?? null`, early return).
