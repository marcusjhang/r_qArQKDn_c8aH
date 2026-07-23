# db conventions

Runner scripts for the database lifecycle. Migrations themselves are generated
into `drizzle/` from `lib/schema/` — do not author schema here.

- `migrate.ts` — applies pending migrations from `drizzle/`.
- `seed.ts` — seeds demo data (the login user + hiring board). Keep it in sync
  with schema/column changes; hiring seed content is shared with
  `lib/hiring/model/seed.ts`.

Run via bun (scripts use `tsx`):

```bash
bun run db:migrate   # apply migrations
bun run db:seed      # seed data
bun run db:setup     # migrate + seed
```

After changing `lib/schema/`, run `bun run db:generate` first to produce the
migration, then `db:setup`. Full recipe: the **drizzle** skill.
