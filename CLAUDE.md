# Project conventions

This is a starter template. Edit anything freely as per the user requests.

## Scoped guidance

Several subdirectories carry their own `CLAUDE.md` with area-specific
conventions, loaded automatically when working in that directory: `app/`,
`lib/`, `lib/hiring/`, `lib/schema/`, `components/hiring/`, and `db/`. They point
to the authoring skills in `.claude/skills/` (`auth`, `drizzle`,
`server-actions`) for full recipes. `test/` is documented in `test/README.md`.

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

## Client state

Server data on the client is managed with **TanStack Query** — the single client
cache. The board goes through `lib/hiring/store.ts` (optimistic updates over the
Query cache); chat and notifications use their own `useQuery`/`useMutation`. Do
**not** add a second client cache or hand-roll a new store for server data — the
legacy optimistic store is being folded onto Query, not extended. Any
`'use server'` read used as a `queryFn` (`fetchBoard`, `loadThread`,
`fetchNotifications`) must check the session itself — it is directly POST-able by
an anonymous caller.

## Auth

- The whole app is gated behind login — enforced by the `authorized` callback in
  `lib/auth.ts` (middleware runs on every route; only `/login` is public).
- Seeded logins: four accounts (`marcusajh0802@gmail.com`, `benong@lightsprint.ai`, `benchan@lightsprint.ai`, `henghonglee@lightsprint.ai`), all with password `password` (override via `SEED_PASSWORD`; change before non-demo use). Because that password is shared, seeded accounts are flagged `must_change_password` and the gate confines them to `/change-password` on first login until they set their own.
- Sign up via `/login` → `POST /api/register`, restricted to the allowlist managed in `/members`.

## App

- Hiring pipeline tracker at `/`. UI in `components/hiring/`, domain/config/store
  in `lib/hiring/`. The Drizzle schema is split by domain under `lib/schema/`
  (`auth.ts`, `hiring.ts`, re-exported from `lib/schema/index.ts`). The hiring
  UI DTOs and reads are behind the `lib/hiring/service/` facade — DTO
  interfaces are authored there and guarded against schema drift at compile
  time, and components import the UI types from `lib/hiring/types.ts`. Writes go
  through the zod-validated server actions in `lib/hiring/actions/`.
- Owners / interviewers and candidate sources are **not** hardcoded configs —
  they are DB-driven. Owners/interviewers are the `users` accounts (`service.ts`
  `loadUsers`); sources are the seeded `sources` table (`loadSources`). Both are
  loaded into `HiringState` (`users` / `sources`) and threaded to the pickers.
  A candidate's `owner`/`source` and a feedback entry's `byUser` are integer FKs
  (`users.id` / `sources.id`), so seeded rows and new sign-ups are automatically
  selectable. `config.ts` keeps only the code-bound value-sets (rating scale,
  status labels, default-stages template).

## Stack

- Next.js 15 (Turbopack)
- React 19, TypeScript, Tailwind CSS
- Auth.js (next-auth v5 beta) with credentials provider
- Drizzle ORM + Neon Postgres
- Shadcn UI components in `components/ui/`
