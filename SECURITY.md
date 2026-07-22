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
  - `SEED_PASSWORD` — password for the seeded accounts (**no default**;
    required to seed the real `@lightsprint.ai` accounts — see below).
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

## Seed credentials (fail-closed, no default)

`bun run db:seed` creates the seeded login accounts. There is **no hardcoded
default password** — the seed will never set a well-known password like
`password`. How each new account's password is chosen:

- **`SEED_PASSWORD` set** — every newly-inserted account uses it.
- **`SEED_PASSWORD` unset** — the seed **fails closed for the real
  `@lightsprint.ai` accounts**: it throws with a message telling you to set
  `SEED_PASSWORD`, so those accounts are never created with a guessable
  password. Demo (non-`@lightsprint.ai`) accounts instead get a **random
  per-account password**, printed to the console **once** at seed time — save
  it then; it is not stored in plaintext or recoverable later.

The seed is **non-destructive on re-run**: it only sets a password when it
*inserts* a new account. An account that already exists keeps its current
password (only its display name is refreshed), so re-seeding never clobbers a
password a user has changed.

**Before any non-demo use:** set a strong `SEED_PASSWORD`. Do not rely on the
random demo passwords for anything but throwaway local data.

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
