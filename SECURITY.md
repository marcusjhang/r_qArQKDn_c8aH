# Security

## Secret management

- **Never commit secrets.** All local configuration lives in `.env`, which is
  git-ignored (`.gitignore` ignores `.env*` and re-includes only `.env.example`).
  The only environment file that belongs in version control is `.env.example`,
  which must contain **placeholders, never real values**.
- Every required and optional variable is documented in
  [`.env.example`](./.env.example). Copy it to `.env` and fill in real values:
  - `DATABASE_URL` — Postgres connection string (**required**).
  - `AUTH_SECRET` — Auth.js signing/encryption secret (**required**). Generate
    with `openssl rand -base64 32`.
  - `SEED_PASSWORD` — shared password for the seeded accounts (**optional**;
    defaults to `password` — see below).
- Lightsprint-managed repos receive `DATABASE_URL` and `AUTH_SECRET`
  automatically; no manual setup is needed for those.

## Rotate anything that was ever committed

Removing a secret from the current tree does **not** remove it from git history —
anyone with repo access can recover it from an old commit. If a secret was ever
committed (intentionally or not), treat it as compromised and **rotate it**:

- `DATABASE_URL` — rotate the database password / issue a new connection string
  with your Postgres provider, then update `.env`.
- `AUTH_SECRET` — generate a new value (`openssl rand -base64 32`). Rotating it
  invalidates all existing sessions, forcing users to log in again.
- Any provider API keys — revoke and reissue them in the provider's dashboard.

To purge a value from history entirely, use `git filter-repo` (or BFG) and
force-push — but rotation is the primary defense; assume the old value is public.

## Default seed credentials

`bun run db:seed` creates the seeded accounts, all sharing a password that comes
from `SEED_PASSWORD`, falling back to the well-known default `password`. This is
a demo convenience only.

**Before any non-demo use:** set a strong `SEED_PASSWORD` (or change the seeded
accounts' passwords after seeding). Do not deploy with the default in place.

## Authentication model

- The entire app is gated behind login. Enforcement lives in the `authorized`
  callback in [`lib/auth.ts`](./lib/auth.ts): the middleware runs on every
  matched request and only `/login` is public.
- [`middleware.ts`](./middleware.ts) excludes only the NextAuth/register API
  routes, Next internals, and static assets from the gate. The `api/` exclusion
  is anchored so a page route that merely starts with `api` is not accidentally
  left public.
- Signups are restricted to an allowlist (`lib/allowlist.ts`), enforced in
  `POST /api/register` and managed from `/members`.
- Passwords are hashed with bcrypt (cost 12) and never logged or returned.
