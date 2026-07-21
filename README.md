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

The seed creates one admin login: **`admin@admin.com` / `password`**. Change
this before any non-demo use. You can also create accounts via **Sign up** on
`/login`. Any signed-in user can use the board.

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

## Database Schema

Schema is in `lib/schema.ts`; migrations live in `drizzle/`.

**Tables:**
- `users` — email/password accounts (auth only)
- `jobs` — a role with its own ordered `stages` (text[])
- `candidates` — one per applicant, references a job; has owner, source, status
- `feedback` — one row per interviewer entry (rating 1–4 + note)

To modify the schema, edit `lib/schema.ts` then run `bun run db:generate`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string. Lightsprint-managed repos get this automatically. |
| `AUTH_SECRET` | Random secret for signing Auth.js tokens. Lightsprint-managed repos get this automatically. For local dev, [generate one](https://generate-secret.vercel.app/32). |
