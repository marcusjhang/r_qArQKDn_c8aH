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
  - `PREVIEW_ORIGIN` — the exact origin/host this deployment is served from
    (**optional**; scopes the Server Actions CSRF allowlist — see
    "Server Actions origin allowlist" below).
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
  matched request and only `/login` is public. The callback gates **page
  routes** — it returns `false` for an unauthenticated request and NextAuth
  redirects it to `/login`.
- [`middleware.ts`](./middleware.ts) excludes only the NextAuth/register API
  routes, Next internals, and static assets from the gate. The `api/` exclusion
  is anchored so a page route that merely starts with `api` is not accidentally
  left public.
- **Mutations are not gated by the middleware directly.** Writes go through the
  `'use server'` server actions in [`lib/hiring/actions.ts`](./lib/hiring/actions.ts),
  which are the board's single write path. They are protected by being behind
  the login gate (the pages that invoke them are unreachable without a session)
  and by validating every input at runtime with a zod schema
  (`lib/hiring/schemas.ts`) before touching the database. The actions
  themselves do not independently re-check the session — they rely on the login
  gate for authentication.
- Signups are restricted to an allowlist (`lib/allowlist.ts`), enforced in
  `POST /api/register` and managed from `/members`.
- Passwords are hashed with bcrypt (cost 12) and never logged or returned.

## Server Actions origin allowlist

Next 15's Server Actions enforce a CSRF check that rejects requests whose
`Origin` doesn't match the deployment's host. Behind the Lightsprint proxy the
app is served at `*.lightsprint.ai` but forwarded with an `x-forwarded-host` of
`*.e2b.app`, so the trusted origins are configured in
[`next.config.ts`](./next.config.ts) (`experimental.serverActions.allowedOrigins`).

- **In production the allowlist is scoped to the single exact host** from
  `PREVIEW_ORIGIN`. It does **not** trust the broad `*.lightsprint.ai` /
  `*.e2b.app` wildcards — those are shared multi-tenant domains, so a wildcard
  would trust every other tenant's sandbox as a same-site origin (previously
  only mitigated by `SameSite=Lax` cookies).
- **The wildcards are a non-production fallback only.** When `PREVIEW_ORIGIN` is
  unset (local `bun run dev`), the broad preview domains are allowed as a
  convenience; when it is unset in production nothing is trusted (fail-closed).
- The dev-server cross-origin allowance (`allowedDevOrigins`) is likewise scoped
  to the exact host when `PREVIEW_ORIGIN` is set.
### Registration enumeration

`POST /api/register` must not reveal whether an email is allowlisted or already
has an account — either signal would let an unauthenticated attacker enumerate
the allowlist and existing users. The endpoint therefore returns a **single
generic response** (`202` with a neutral "if this email is eligible…" message)
for every request that passes input validation, whether the account was newly
created, already existed, or the email was not on the allowlist. The allowlist
and duplicate checks still fully gate account creation server-side
(`lib/registration.ts`); only the *response* is uniform, and the internal
`created` flag it returns is never echoed to the client.

Genuine input-validation failures (missing email/password, password shorter
than the minimum length) still return a clear `400` — these describe the
request, not account existence, so they leak nothing.
