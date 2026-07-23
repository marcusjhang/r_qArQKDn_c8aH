# Backend checklist (server actions + Drizzle + zod + next-auth)

Applies to `lib/**/actions.ts`, `lib/hiring/service.ts`, `app/**/route.ts`,
`app/**/actions.ts`, `middleware.ts`, `lib/auth.ts`, `lib/db.ts`, `db/**`,
`drizzle/**`.

This checklist has two layers: **language-agnostic** service/API principles
that hold on any backend, and **stack-specific** rules for this repo's server
actions + Drizzle + next-auth setup. Apply both.

> Reviewing Drizzle/DB work is the flag-list below. For the *authoring* recipes
> it mirrors (schema change → generate → seed → setup, writing reads/actions,
> idempotent migrations, drizzle-* upgrades), see the **`drizzle`** skill.

## API & service design (language-agnostic)

These apply to any endpoint or write path — server actions here, but the same
for a REST/GraphQL/RPC handler:

- **Correct method semantics.** Reads are safe and side-effect-free; a read must
  never mutate. Match the verb to the operation (GET/READ = safe, PUT/DELETE =
  idempotent, POST/CREATE = not). Flag a "get"/query that writes.
- **Idempotency where retries happen.** Anything a client may retry (network
  blips, optimistic UI resync, payment/order creation) should tolerate being
  called twice without duplicating or corrupting data — via a natural key, an
  idempotency token, upsert/`onConflict`, or a guard. Handle concurrent
  duplicate requests, not just sequential ones. (This repo's seed and allowlist
  inserts already model this.)
- **Validate at the boundary.** Never trust caller input. Parse/validate every
  request payload before use and reject invalid input clearly. Treat all
  external input as untyped until validated.
- **Meaningful status/outcome codes.** Don't collapse everything into
  success-or-500. Distinguish caller error (4xx: 400 malformed, 401/403 auth,
  404 missing, 409 conflict, 422 validation, 429 rate-limit) from server failure
  (5xx). The code is a diagnostic contract — keep it honest.
- **Structured error responses, no internal leakage.** Return a consistent error
  shape (code + human message + a request/correlation id); never leak stack
  traces, SQL, secrets, or internal table/field names to the client. Log the
  detail server-side with structured context instead.
- **Resilience.** Retries use backoff + jitter and honor any `Retry-After`;
  transient vs permanent failures are distinguished. Don't retry a
  non-idempotent op blindly.
- **Contracts are sticky (Hyrum's Law).** Once a response shape, field name, or
  status code is observable, someone depends on it. Flag breaking changes to an
  existing surface (removed/renamed field, changed code) that ship without a
  version/deprecation path.
- **Consistency & domain naming.** One casing/pluralization/pagination
  convention across endpoints. URLs/fields reflect domain concepts, not database
  tables or internal architecture.
- **Observability.** Errors and notable events are logged with enough structured
  context (ids, not just free text) to trace one request end-to-end.
- **Test the awkward paths.** Call idempotent endpoints twice and assert
  identical outcomes; consider realistic data volumes (100 rows ≠ 100k) for
  anything that lists or scans.

## Server actions — the single write path

> Authoring recipe for this path (new mutation: zod schema → optimistic store
> action → `'use server'` action → TanStack Query resync on failure): the
> **`server-actions`** skill.

- Every mutation is a server action (`'use server'`). Flag a write performed
  outside an action (e.g. a `route.ts` doing an ad-hoc DB write that the action
  layer should own).
- **Validate every input with zod at the boundary.** Each action's raw args must
  be parsed through the validators in `lib/**/schemas.ts` (`zId.parse`,
  `candidateInsertSchema.parse`, …) before touching the DB. Flag any action that
  trusts a raw `number`/`string` argument. A parse failure should throw so the
  client store's `resync()` reverts the optimistic change — don't swallow it.
- **Cache resync after a mutation — know which layer.** The hiring board has
  **no** server-side Data Cache: its reads are uncached and **TanStack Query is
  the sole cache**, so a board action must NOT `revalidateTag`/`revalidatePath`
  (the client store updates optimistically and, on a failed write, `resync()`s by
  `invalidateQueries` → refetch). Flag a board action that adds a stray
  `revalidate*`. The *server-rendered* `/settings` and `/members` pages are the
  opposite case — they don't use TanStack Query, so their actions must
  `revalidatePath('/settings')` / `revalidatePath('/members')` after a write, or
  the page goes stale on navigation; flag one of those with no revalidation.
- **Multi-statement invariants use a transaction.** When an update must stay
  consistent across tables/rows (e.g. `renameStage` updates the job's stage
  array _and_ re-points candidates), wrap it in `db.transaction`. Flag
  co-dependent writes done as separate awaited statements.
- Enforce domain caps/guards server-side (e.g. `MAX_FAVORITES`, `stageDeletable`,
  `validateStageName`) — the server is authoritative even if the client also
  checks. Return early (`return`/`return null`) on guard failure rather than
  throwing when the failure is expected/benign.

## Layering: thin adapters over server-only domain services

The write path is layered so business rules live in a testable core, not in the
transport. This is the split PR #19 established and it is now the expected shape:

- **HTTP handlers are thin adapters.** An `app/api/**/route.ts` should parse the
  request, call a `server-only` domain service, and map the result onto
  `NextResponse` + status — nothing more. The account rules (required fields,
  password length, allowlist, duplicate check, hashing, user creation) live in
  `lib/registration.ts`, not in the handler. Flag a route handler that inlines
  validation/business logic the domain layer should own, or that reaches for the
  DB directly instead of going through the service.
- **Domain services return a discriminated result, not exceptions-as-control.**
  `registerUser` returns `{ ok: true } | { ok: false; error; status }` so the
  domain owns the rule while the adapter owns the transport. Flag a service that
  throws for an expected outcome the caller must branch on, or that returns a
  loose `{ ok; error? }` bag instead of a discriminated union (see
  `type-management.md`).
- **Keep domains separate.** Auth/user concerns (`lib/registration.ts`,
  `lib/allowlist.ts`) stay out of `lib/hiring/`, and a domain service must not
  import `next/server` — that keeps it reusable and unit-testable without the
  HTTP layer (see `testability.md`). Flag cross-domain reach-ins and a
  `next/*` import creeping into a domain module.

## Queries — reads

- Read modules are `import 'server-only'` (see `lib/hiring/service.ts`). Flag a
  query module missing it, or a query imported into a client component.
- **Reads are injectable for tests.** `getBoard` takes a `BoardReader` with
  the Drizzle reader as the default and imports `db` lazily, so it runs without a
  live DB (see `testability.md`). Preserve this seam — flag a new query that
  hard-codes the `db` singleton where the composition should accept an injected
  reader, or a top-level `db` import that forces a client at module load.
- Use Drizzle's relational query API with a `columns` allowlist so the result is
  exactly the UI type (`HiringState`) — **no casts, no manual grouping, no
  field renames**. Flag `as` casts used to force a query result into a type.
- Parallelize independent reads with `Promise.all` (as `getBoard` does)
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

## Dependency & migration hygiene

Dependency upgrades are a health area (technical debt) — PR #13 bumped the
Drizzle stack. Review a dependency bump like any other change:

- **Keep tightly-coupled packages in lockstep.** `drizzle-orm` and `drizzle-kit`
  must move together (their snapshot/type formats are paired); so must a
  framework and its plugins. Flag one half of such a pair bumped alone.
- **Regenerate what the tool owns.** After a Drizzle bump, `bun run db:generate`
  must report a clean tree — a newer `drizzle-kit` may start tracking constraints
  an older one didn't (0.31 tracks CHECKs), so a regenerated migration should be
  in the diff. Flag a version bump that leaves `db:generate` dirty.
- **Generated migrations stay idempotent.** A regenerated CHECK/enum migration
  must be a safe no-op on a DB where an earlier hand-authored version already ran
  — wrap it in the existing `duplicate_object` guard so `0000→latest` and
  incremental setups both succeed.
- **Verify, don't assume.** A dependency change is only reviewable if
  `bun run typecheck`, `bun run test`, and `bun run build` are confirmed green
  (and `db:generate` clean for a Drizzle bump). Flag a lockfile/manifest bump
  with no verification evidence as `needs-verification`.

## Dead code & schema/DB drift

PR #25 removed an unused `role` column+enum that had been threaded through the
schema, seed, and NextAuth session but was never used for any authorization
decision — and the live DB had meanwhile drifted (an enum value the code didn't
know about). Watch for both:

- **Unused scaffolding is a finding, not neutral.** A column, enum, field, prop,
  or export that is defined and propagated but never read for a decision is dead
  weight that invites drift — flag it for removal rather than leaving it. When a
  change removes such scaffolding, confirm it is pulled from **every** layer
  (schema, module augmentation, auth callbacks, seed, migration) so nothing
  dangles.
- **Let `knip` find it.** `bun run detect:dead-code` (Step 5) mechanically
  reports unused files, exports, and dependencies — this is the primary detector
  for this section. Focus on what the diff *newly* orphans (an export stranded by
  a refactor, an added-but-unused dependency), not the pre-existing backlog.
  Remove genuinely-dead items (and `bun remove` any dependency they pulled in);
  only deliberately silence a real public-API/framework/config entry in
  `knip.json` with a stated reason — never grow the ignore list to bury live dead
  code.
- **Schema is the source of truth; reconcile the live DB.** A change that drops
  or alters a column/enum must ship the `DROP COLUMN` / `DROP TYPE` / `ALTER`
  migration that reconciles the already-migrated database, not just the
  `lib/schema.ts` edit — otherwise the live DB and the schema diverge. Flag a
  schema removal with no matching migration, and call out any value/column known
  to exist in the live DB that the schema no longer models.

## Auth & API routes

> Authoring recipes for the gate, the matcher, and registration/allowlist: the
> **`auth`** skill (and `SECURITY.md` for policy).

- The app is gated by the `authorized` callback in `lib/auth.ts` via
  `middleware.ts`; only `/login` is public. If a new route must be public, the
  middleware matcher / `authorized` logic must be updated deliberately — flag a
  new public surface that wasn't intended.
- **Matcher exclusions must be anchored and precise** (PR #14). An `api/`
  exclusion has to be anchored so a page route that merely *starts with* "api"
  (e.g. a future `/api-docs`) is still gated, and the static-asset exclusion
  should be exactly the public assets (images, fonts, `favicon`, `webmanifest`)
  and no more. Flag a loose/unanchored matcher pattern that accidentally opens
  page routes, or a narrowed one that starts gating a genuine static asset.
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
