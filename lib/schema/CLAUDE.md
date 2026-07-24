# lib/schema conventions

The Drizzle schema — the single source of truth for the database shape. Types
and zod insert-schemas are derived from these tables; never hand-maintain a
parallel definition.

## Layout

- Split by domain: `auth.ts` (users/accounts) and `hiring.ts` (jobs, candidates,
  feedback), each self-contained with its own tables and relations.
- `index.ts` is the barrel that preserves the single `@/lib/schema` import
  surface consumed by `lib/db.ts`, `drizzle.config.ts`, and the migrate/seed
  scripts. Re-export new tables **and their relations** here so the
  `db.query` relational API stays wired.

## Changing the schema

Edit the table here, then run the generate flow — do not write migration SQL by
hand unless the drizzle skill says to:

```bash
bun run db:generate   # emit a migration into drizzle/ from the schema diff
bun run db:setup      # migrate + seed
bun run typecheck
```

Keep `db/seed.ts` and `lib/hiring/seed.ts` in sync with column changes, and
remember downstream `Select*` types (e.g. in `lib/hiring/service/`) flow from
here. See the **drizzle** skill for the full end-to-end recipe and the
drizzle-orm / drizzle-kit upgrade rules.
