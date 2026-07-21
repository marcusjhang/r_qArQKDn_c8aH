# Next.js + PostgreSQL Starter

A full-stack Next.js 15 starter with email/password authentication, PostgreSQL via Drizzle ORM, and an admin dashboard.

## Stack

- **Framework** - [Next.js 15 (App Router)](https://nextjs.org)
- **Language** - [TypeScript](https://www.typescriptlang.org)
- **Auth** - [Auth.js](https://authjs.dev) with email/password credentials
- **Database** - [PostgreSQL](https://www.postgresql.org/) via [Neon](https://neon.tech)
- **ORM** - [Drizzle](https://orm.drizzle.team)
- **Styling** - [Tailwind CSS](https://tailwindcss.com)
- **Components** - [Shadcn UI](https://ui.shadcn.com/)

## Getting Started

### Lightsprint-managed repos

If you created this repo through Lightsprint, `DATABASE_URL` and `AUTH_SECRET` are already configured in your sandbox environment. Run database setup and start developing:

```bash
npm run db:setup   # Runs migrations + seeds sample data
npm run dev
```

### Local development

1. Create a PostgreSQL database (e.g. on [Neon](https://neon.tech))

2. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

3. Install dependencies, set up the database, and start the dev server:

```bash
npm install
npm run db:setup   # Runs migrations + seeds sample data
npm run dev
```

4. Open http://localhost:3000 and create an account.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run db:generate` | Generate a new Drizzle migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed sample product data (idempotent — skips if data exists) |
| `npm run db:setup` | Run migrations + seed in one step |

## Database Schema

Schema is defined in `lib/schema.ts` using Drizzle ORM. Migrations live in `drizzle/`.

**Tables:**
- `users` — email/password accounts
- `products` — sample product catalog with status, price, stock

To modify the schema, edit `lib/schema.ts` then run `npm run db:generate` to create a migration.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string. Lightsprint-managed repos get this automatically. |
| `AUTH_SECRET` | Random secret for signing Auth.js tokens. Lightsprint-managed repos get this automatically. For local dev, [generate one](https://generate-secret.vercel.app/32). |
