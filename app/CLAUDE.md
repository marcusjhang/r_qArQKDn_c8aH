# app conventions

Next.js 15 App Router (Turbopack, React Server Components by default).

## Route groups & the auth gate

- The whole app is gated behind login. `middleware.ts` (repo root) runs the
  `authorized` callback from `lib/auth.ts` on every matched route; its matcher
  excludes `api/`, `_next/*`, and static assets — everything else must reach the
  gate. Only `/login` is public.
- `(dashboard)/` — the authenticated app (route group, no URL segment). `page.tsx`
  is the hiring board `/`; `settings/` holds appearance/profile/sources/bands; and
  `members/` holds the members directory (per-member activity history) + the
  signup allowlist UI, each with its own `actions.ts`.
- `login/` — the public sign-in / sign-up page.
- `api/auth/[...nextauth]/` — NextAuth handlers. `api/register/` — self-guarded
  registration (checks the allowlist itself; excluded from the middleware gate).

## Adding a route

- A new **page** is gated automatically by the matcher — no change needed to make
  it protected. To make a route **public**, you must adjust the matcher AND the
  `authorized` logic; see the **auth** skill for the exact recipe (and keep
  `SECURITY.md` in sync).
- Server Components fetch through the domain facades (`lib/hiring/core/service.ts`),
  not the `db` singleton directly. Mutations use `'use server'` actions —
  colocate route-specific ones (as `settings/actions.ts` does) or reuse
  `lib/hiring/core/actions.ts`.

Anything touching login, middleware, the allowlist, registration, or auth env
vars → use the **auth** skill.
