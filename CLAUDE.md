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
- Seeded login: `marcusajh0802@gmail.com` / `password`, seeded with the `owner`
  role (override password via `SEED_PASSWORD`; change before non-demo use).
- RBAC: every user has a role (`reader` < `writer` < `admin` < `owner`), stored
  on `users.role` and threaded onto the session in `lib/auth.ts`. The hierarchy
  and permission checks are the single source of truth in `lib/rbac.ts`
  (`canWrite`, `canManageAllowlist`, `canManageRoles`, `isOwner`). Capabilities:
  - **reader** — view the board only.
  - **writer** — reader + all pipeline work (every `lib/hiring/actions.ts`
    mutation; gated by `assertCanWrite`).
  - **admin** — writer + manage the signup allowlist and assign roles up to
    admin (in `/settings`).
  - **owner** — admin + the exclusive ability to grant/change the `owner` role.
  Signups default to `reader`; an admin promotes them under `/settings`
  → Members. Server actions enforce RBAC independently of the UI gating.
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
