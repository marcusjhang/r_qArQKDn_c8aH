# Project conventions

This is a starter template. Edit anything freely as per the user requests.

## Package manager

Use **bun**, not npm.

```bash
bun install          # install deps
bun run dev          # start dev server
bun run build        # production build
bun run db:setup     # migrate + seed
bun run db:migrate   # apply migrations
bun run db:seed      # seed data
bun run db:generate  # generate migration after schema change
```

## Auth

- The whole app is gated behind login — enforced by the `authorized` callback in
  `lib/auth.ts` (middleware runs on every route; only `/login` is public).
- Seeded login: `marcusajh0802@gmail.com` / `password` (override via `SEED_PASSWORD`; change before non-demo use).
- Sign up via `/login` → `POST /api/register`, restricted to the allowlist managed in `/settings`.

## App

- Hiring pipeline tracker at `/`. UI in `components/hiring/`, domain/config/store
  in `lib/hiring/`. Types are derived from the Drizzle schema (`lib/schema.ts`);
  reads go through `lib/hiring/queries.ts`, writes through the zod-validated
  server actions in `lib/hiring/actions.ts`.

## Stack

- Next.js 15 (Turbopack)
- React 19, TypeScript, Tailwind CSS
- Auth.js (next-auth v5 beta) with credentials provider
- Drizzle ORM + Neon Postgres
- Shadcn UI components in `components/ui/`
