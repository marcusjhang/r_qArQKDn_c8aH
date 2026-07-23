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

Because that password is shared and well-known, each seeded account is created
with a `must_change_password` flag set (`lib/schema/auth.ts`, set true in
`db/seed.ts`). On first login the `authorized` gate (`lib/auth.config.ts`) confines the
account to `/change-password` — it cannot reach any other page — until it sets
its own password, which clears the flag. Re-seeding resets the shared password
and re-arms the flag. Self-registered accounts (`/api/register`) choose their
own password and are never flagged.

**Before any non-demo use:** set a strong `SEED_PASSWORD` (or change the seeded
accounts' passwords after seeding). Do not deploy with the default in place.

## Authentication model

- The entire app is gated behind login. Enforcement lives in the `authorized`
  callback in [`lib/auth.config.ts`](./lib/auth.config.ts) — the edge-safe auth
  config that [`middleware.ts`](./middleware.ts) builds the gate from (and that
  [`lib/auth.ts`](./lib/auth.ts) extends with the DB-backed credentials provider
  for the Node runtime). The middleware runs on every matched request and only
  `/login` is public. The callback gates **page routes** — it returns `false`
  for an unauthenticated request and NextAuth redirects it to `/login`.
- **Forced first-login password change.** The same callback adds a second gate:
  a signed-in account whose `must_change_password` flag is set (the seeded
  accounts — see "Default seed credentials") is redirected to `/change-password`
  from every other page and can only leave once it sets a new password. The flag
  travels on the JWT/session, so the `/change-password` server action clears it
  in the DB and the client re-authenticates with the new password to replace the
  stale token.
- [`middleware.ts`](./middleware.ts) excludes only the NextAuth/register API
  routes, Next internals, and static assets from the gate. The `api/` exclusion
  is anchored so a page route that merely starts with `api` is not accidentally
  left public.
- **Mutations are not gated by the middleware.** Writes go through the
  `'use server'` server actions in [`lib/hiring/actions.ts`](./lib/hiring/actions.ts)
  (the board's single write path), plus the settings and members actions. The
  middleware gates *page* routes only: Server Actions dispatch by action id (the
  `Next-Action` header) and can be POSTed to the public `/login` route, which the
  gate lets through — so the page gate never runs for them, and being "behind" a
  gated page does **not** protect them. Every write action therefore confirms the
  session itself before touching the database — the board and members actions
  call `requireUser()` (`lib/auth.ts`, throws `Unauthorized` when not signed in)
  and the settings actions call the local `signedInUserId()` guard — in addition
  to validating every input at runtime with a zod schema (`lib/hiring/schemas.ts`).
  Add the same guard to any new action; do not rely on the middleware.
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

## Rate limiting (auth endpoints)

The two unauthenticated auth endpoints are throttled to blunt credential
stuffing / brute-force and unlimited account creation:

- **Login** — `POST /api/auth/callback/credentials` is limited per client IP
  (see the wrapper in `app/api/auth/[...nextauth]/route.ts`).
- **Register** — `POST /api/register` is limited per client IP and per targeted
  email (`app/api/register/route.ts`).

Over the limit returns **HTTP 429** with a `Retry-After` header. The client IP
is read from `x-forwarded-for` / `x-real-ip` and fails safe to a shared bucket
when absent.

The limiter (`lib/rate-limit.ts`) is a sliding-window log behind a pluggable
store, selected by `createDefaultStore()`:

- **Postgres (`PostgresRateLimitStore`) — the scalable, default production
  path.** Every app instance reads/writes one `rate_limit_hits` table via the
  `rate_limit_hit()` SQL function, which prunes, decides, and appends the hit
  **atomically under a per-key row lock**. Because all instances share one
  authoritative counter, the limit is **global** across instances and serverless
  cold starts — not per-process. This reuses the Postgres database the app
  already depends on, so it needs no extra infrastructure (Redis / Upstash would
  be an equivalent alternative only if one were already in the stack).
- **In-memory (`InMemoryRateLimitStore`) — local dev / tests.** State lives in a
  module-level Map, so the limit is per-process (a meaningful mitigation, not a
  hard guarantee behind multiple instances).

The store is chosen automatically — Postgres when `DATABASE_URL` is set, else
in-memory — and can be forced with `RATE_LIMIT_STORE=postgres|memory` (see
`.env.example`). If the store errors (e.g. the database is briefly
unreachable), the limiter **fails open** (allows the request and logs a warning)
so a store outage can never lock every user out of signing in; rate limiting is
a best-effort mitigation, so availability wins over strict enforcement.
