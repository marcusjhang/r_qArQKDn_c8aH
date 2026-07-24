# Lightsprint Hiring — Pipeline Tracker

A board-first hiring pipeline tracker for a small founding team: per-job Kanban
boards with configurable stages, one owner per candidate, per-interviewer
feedback, and an orthogonal status. The whole app is gated behind login.

## Stack

- **Framework** - [Next.js 15 (App Router)](https://nextjs.org)
- **Language** - [TypeScript](https://www.typescriptlang.org)
- **Auth** - [Auth.js](https://authjs.dev) with email/password credentials
- **Database** - [PostgreSQL](https://www.postgresql.org/) via [Neon](https://neon.tech)
- **ORM** - [Drizzle](https://orm.drizzle.team)
- **Styling** - [Tailwind CSS](https://tailwindcss.com) (the board uses its own scoped stylesheet)

## Getting Started

### Lightsprint-managed repos

`DATABASE_URL` and `AUTH_SECRET` are already configured in your sandbox. Run
database setup and start developing:

```bash
bun run db:setup   # Runs migrations + seeds the sample pipeline + admin login
bun run dev
```

### Local development

1. Create a PostgreSQL database (e.g. on [Neon](https://neon.tech)).
2. Copy `.env.example` to `.env` and fill in your values (`cp .env.example .env`).
3. Install, set up the database, and run the dev server:

```bash
bun install
bun run db:setup
bun run dev
```

4. Open http://localhost:3000 and sign in (see Accounts below).

## Accounts

The seed creates four logins — `marcusajh0802@gmail.com`, `benong@lightsprint.ai`,
`benchan@lightsprint.ai`, and `henghonglee@lightsprint.ai` — all with the password
**`password`** (override with `SEED_PASSWORD`). Change it before any non-demo use.
New accounts are created via **Sign up** on `/login`, restricted to the email
allowlist managed on `/members`. Any signed-in user can use the board.

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start the dev server (Turbopack) |
| `bun run build` | Production build |
| `bun run start` | Run production server |
| `bun run db:generate` | Generate a new Drizzle migration from schema changes |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:seed` | Seed the admin login + sample pipeline (idempotent) |
| `bun run db:setup` | Run migrations + seed in one step |
| `bun run typecheck` | Type-check the project (`tsc --noEmit`) |
| `bun run detect:dead-code` | Audit for unused files, exports and dependencies ([knip](https://knip.dev)) |
| `bun run test` | Run the unit test suite (Vitest) |

## Dead Code & Dependency Audit

To keep the surface lean as the app grows, [knip](https://knip.dev) audits the
codebase for **unused files, unused exports, and unused/unlisted dependencies**.
Its Next.js, Vitest, Playwright and Drizzle plugins understand this stack's
file-based routing and test/config entry points, so App Router pages, layouts,
route handlers, `middleware.ts`, and the `db/` scripts are recognised
automatically and are never reported as unused.

Run the audit:

```bash
bun run detect:dead-code
```

Configuration lives in `knip.json`. The `drizzle/` directory (generated
migrations) is excluded, and `prettier` is kept in `ignoreDependencies` because
it is used via the inline config in `package.json` rather than a script.

### Workflow — triaging findings

knip exits non-zero when it finds anything, so it doubles as a CI gate. When it
reports an item:

1. **Genuinely unused → remove it.** Delete the dead file/export, then drop any
   dependency it pulled in with `bun remove <pkg>`. Re-run `bun run typecheck`
   and `bun run test` to confirm nothing broke.
2. **Intentionally kept (public API, framework contract, config-only tool) →
   ignore it deliberately.** Add the entry to the relevant `knip.json` field
   (`ignore`, `ignoreDependencies`, `ignoreBinaries`) or annotate the export
   with a `// @public` JSDoc tag, and note _why_ so the next reader understands
   the exception. Prefer removal over ignoring.

Run `bun run detect:dead-code` before opening a PR that adds or removes modules
or dependencies, and clear new findings you introduce.

### Continuous integration

The audit also runs automatically on every push to `main` and on every pull
request via the **Dead code audit (knip)** job in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml). It installs
dependencies from the frozen lockfile and runs the same
`bun run detect:dead-code` command.

The dead-code backlog has been cleared, so the job is **enforcing**: knip exits
non-zero on any new finding, which fails the job and blocks the merge. To
temporarily un-gate it (e.g. while working down a fresh batch of findings), add
`continue-on-error: true` back to the job in `.github/workflows/ci.yml`.

## Database Schema

Schema is in `lib/schema/`; migrations live in `drizzle/`.

**Tables:**
- `users` — email/password accounts (auth only)
- `jobs` — a role with its own ordered `stages` (text[])
- `candidates` — one per applicant, references a job; has owner, source, status
- `feedback` — one row per interviewer entry (rating 1–4 + note)

To modify the schema, edit `lib/schema/` then run `bun run db:generate`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string. Lightsprint-managed repos get this automatically. |
| `AUTH_SECRET` | Random secret for signing Auth.js tokens. Lightsprint-managed repos get this automatically. For local dev, [generate one](https://generate-secret.vercel.app/32). |
