---
name: drizzle
description: >-
  How to work with Drizzle ORM in this repo — the schema-as-single-source-of-
  truth model, the exact end-to-end recipes for a schema change (edit →
  db:generate → keep the seed in sync → db:setup → typecheck), writing
  server-only reads and zod-validated write actions, hand-authoring idempotent
  migrations, and the drizzle-orm/drizzle-kit upgrade rules. Use whenever a task
  touches lib/schema.ts, drizzle/**, db/** (migrate/seed), lib/hiring/service.ts,
  lib/**/actions.ts, lib/hiring/primitives.ts, lib/hiring/schemas.ts, or bumps a
  drizzle-* dependency. For *reviewing* Drizzle changes, use the pr-code-review
  skill (references/backend.md + type-management.md) — this skill is for
  authoring them.
---

# Working with Drizzle in this repo

Neon Postgres via Drizzle ORM. This is the **authoring** companion to the
`pr-code-review` skill: that skill's `references/backend.md` and
`references/type-management.md` are the review lens (what gets *flagged*); this
skill is the how-to (the *recipes* for getting a change right the first time).
When they overlap, they agree — update both if a rule changes.

## The golden rule: the schema is the single source of truth

`lib/schema.ts` is authoritative. Everything else is **derived**, so nothing can
silently drift:

- **Row types** come from `typeof table.$inferSelect` (`SelectUser`,
  `SelectJob`, `SelectCandidate`, … in `lib/schema.ts`). UI/domain types are
  built from those via `Pick`/`Omit` in `lib/hiring/types.ts` — never hand-write
  a type that restates columns.
- **Fixed value-sets** are declared once as a `const` tuple in
  `lib/hiring/primitives.ts` (`STATUSES`, `RATING_VALUES`) and consumed three
  ways: the DB enum/CHECK (`pgEnum('candidate_status', STATUSES)`), the TS type
  (`type Status = (typeof STATUSES)[number]`), and the zod validator
  (`z.enum(STATUSES)` in `lib/hiring/schemas.ts`). Add a value in the tuple and
  all three follow.
- **Derived types cross the client boundary as `import type` only**, so
  Drizzle's postgres runtime never lands in the browser bundle.

## File map

| File | Role |
| --- | --- |
| `lib/schema.ts` | Tables, enums, relations, CHECK constraints. Source of truth. |
| `lib/db.ts` | The Drizzle client singleton + re-exported tables/types. Server-only. |
| `drizzle.config.ts` | Points drizzle-kit at `./lib/schema.ts`, out `./drizzle`, dialect `postgresql`. |
| `drizzle/**` | Generated + hand-authored migrations and `meta/` snapshots. Committed. |
| `db/migrate.ts` / `db/seed.ts` | The `db:migrate` / `db:seed` runners. |
| `lib/hiring/seed.ts` | Typed seed *data* (`SEED_JOBS`, `SEED_CANDIDATES`). |
| `lib/hiring/primitives.ts` | The single-sourced value-set tuples. |
| `lib/hiring/schemas.ts` | zod validators for the server-action boundary (`drizzle-zod` insert shapes + refinements). |
| `lib/hiring/service.ts` | `server-only` relational reads (the read facade). |
| `lib/hiring/actions.ts` | `'use server'` zod-validated mutations (the single write path). |

Commands (bun): `db:generate` (drizzle-kit generate) · `db:migrate` · `db:seed`
· `db:setup` (migrate + seed) · `typecheck` (tsc) · `detect:dead-code` (knip;
`drizzle/**` is ignored in `knip.json` because migrations are generated).

## Recipe: change the schema (end-to-end)

A schema change is not done until **schema + migration + seed** all agree — the
DB is *seeded* on every boot (`db:setup`), so a stale seed breaks the
environment, not just the migration.

1. **Edit `lib/schema.ts`** — add/alter the column, table, enum, relation, or
   CHECK. Give real invariants DB-level teeth (`notNull`, `unique`, `check`, FK
   `onDelete`) rather than app-only checks.
2. **Generate the migration**: `bun run db:generate`. Commit the new
   `drizzle/NNNN_*.sql` **and** its `meta/NNNN_snapshot.json` + the updated
   `_journal.json`. Never hand-edit an already-applied migration — always add a
   new one.
3. **Keep the seed satisfiable** (both halves):
   - A new `notNull` column with no default breaks every insert in `db/seed.ts` /
     `lib/hiring/seed.ts` — add a DB default, backfill in the migration, **or**
     add the value to the seed data.
   - A renamed/removed column or table must be renamed/removed in the seed too.
     `tsc` catches typed seed data, but **not** raw `.values({...})` keys — read
     them.
   - A changed value-set: `tsc` flags a *removed* enum value in `SEED_*`, but a
     new *required* one won't fail — confirm the seed still represents the states
     you intend.
   - A new table that needs sample rows: insert in FK-safe order (the runner does
     users → allowlist → jobs → candidates → feedback).
4. **Reconcile the live DB.** A drop/alter must ship the `DROP COLUMN` /
   `DROP TYPE` / `ALTER` migration that reconciles the already-migrated database
   (see `drizzle/0008` dropping the `role` column+enum). Schema-only edits leave
   the live DB drifted.
5. **Apply + verify**: `bun run db:setup` must complete cleanly (it re-runs on
   every sandbox boot, so seed steps must stay idempotent — see below). Then
   `bun run typecheck` (derived types surface most drift) and
   `bun run detect:dead-code`.

## Recipe: add or change a fixed value-set (enum)

1. Edit the tuple in `lib/hiring/primitives.ts` — this is the *only* place the
   values are literally listed.
2. Regenerate the migration (`db:generate`) — a pgEnum change needs a DB
   migration; new enum values may need `ALTER TYPE ... ADD VALUE`.
3. The TS type and `z.enum(...)` update automatically because they read the
   tuple. Confirm any `$type<…>()` annotation and CHECK still match.
4. Update `SEED_*` data if the change affects seeded rows.

Adding a value in `schemas.ts` or a UI type *without* touching the tuple is
exactly the drift this pattern prevents — don't.

## Recipe: write a read (query)

- Put it in a `import 'server-only'` module (`lib/hiring/service.ts`). Never
  import a query — or `lib/db` — into a client component.
- Use the **relational query API with a `columns` allowlist** so the result *is*
  the UI type with no casts, no manual grouping, no field renames. Nest related
  rows with `with:` (one query) rather than per-row follow-ups (N+1).
- Parallelize independent reads with `Promise.all`.
- **Keep the injectable-reader seam.** `getBoard(reader: BoardReader =
  drizzleReader)` reads through an interface and imports `db` **lazily**, so the
  logic unit-tests with a fake reader and no `DATABASE_URL`. Don't hard-code the
  `db` singleton where composition should be injectable, and don't add a
  top-level `import { db }` that constructs the client at module load.

## Recipe: write a mutation (server action)

- Every write is a server action (`'use server'`) in `lib/**/actions.ts` — the
  single write path. Don't do ad-hoc DB writes from a `route.ts`.
- **Validate raw args with zod at the boundary** using `lib/hiring/schemas.ts`
  (`zId.parse`, `candidateInsertSchema.parse`, …) before touching the DB. Let a
  parse failure throw — the client store's resync reverts the optimistic change;
  don't swallow it.
- **Cache resync is layer-specific.** The board is uncached server-side —
  TanStack Query is its only cache — so a board action does **not** `revalidate*`
  (the client store resyncs). Only the server-rendered `/settings` and `/members`
  pages `revalidatePath` their own route after a write.
- **Wrap multi-statement invariants in `db.transaction`** (e.g. `renameStage`
  updates the job's `stages` array *and* re-points candidates).
- Use bound Drizzle helpers (`eq`, `and`, `ne`, `sql`) — never string-interpolate
  user input into `sql``. Enforce domain caps/guards server-side even if the
  client mirrors them.

## Migrations

- **Generated is the default** — `db:generate` writes the SQL + snapshot. Commit
  both. Regenerating afterward should report no changes.
- **Hand-authored SQL is idempotent.** CHECK constraints and enum creates that
  drizzle-kit didn't always track are wrapped in a `DO $$ BEGIN … EXCEPTION WHEN
  duplicate_object THEN null; END $$;` guard and tables use `CREATE TABLE IF NOT
  EXISTS`, so `0000 → latest` and incremental setups both succeed on any DB
  (see `drizzle/0002`, `0003`, `0009`).
- **Never rewrite an applied migration.** Fix-forward with a new one.

## Upgrading drizzle-orm / drizzle-kit

- **Move the two in lockstep** — their snapshot/type formats are paired; bumping
  one alone causes schema-generation mismatches.
- After the bump, `bun run db:generate` must be clean. A newer drizzle-kit may
  start tracking constraints an older one didn't (0.31 tracks CHECKs), so a
  regenerated migration may appear — wrap/commit it and re-run to confirm clean.
- `drizzle-zod`'s `createInsertSchema` call sites in `schemas.ts` must still
  type-check. Verify `bun run typecheck`, `bun run test`, and `bun run build`
  before committing.

## Seed idempotency

`db:setup` re-runs on every boot, so seed steps must be safely repeatable —
follow the existing patterns: `onConflictDoNothing` for the allowlist,
create-or-update for login accounts, skip-if-rows-exist (`count()`) for the
hiring data. A new seed insert that would throw or duplicate on a second run is
a bug.

## Cross-links

- Review lens for all of the above: `pr-code-review` →
  `references/backend.md` (write path, queries, DB correctness, migration+seed,
  dependency hygiene, dead code) and `references/type-management.md` (derived
  types, single-sourced value-sets, discriminated-union results).
- Auth/security touching the DB: `SECURITY.md`.
