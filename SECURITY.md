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
  - `ANTHROPIC_API_KEY` — provider key for the AI "Suggest from JD" trait
    recommender (`lib/hiring/ai.ts`) (**optional**; when unset the recommender is
    disabled and the Traits modal falls back to manual entry). Read only from the
    environment — never hardcoded, logged, or returned to the client. Optional
    companions: `ANTHROPIC_BASE_URL` (route through a gateway) and
    `TRAIT_AI_MODEL` (override the default model).
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
- **Voluntary password change (`/settings` → Security).** A signed-in account can
  change its own password from settings. Unlike the forced first-login flow, this
  is voluntary, so the `updatePassword` service (`lib/password.ts`) verifies the
  **current** password with bcrypt before writing — a stolen session token or an
  unattended logged-in session cannot silently take the account over by setting a
  new password. A wrong current password and the (defensive) missing-account case
  return the same generic "current password is incorrect" message. The `updatePassword`
  settings action confirms the session itself (`signedInUserId()`), like every
  other action. The password is not part of the session token, so no re-auth is
  needed; existing JWT sessions remain valid until they expire.
- [`middleware.ts`](./middleware.ts) excludes only the NextAuth/register/MCP API
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

## MCP access tokens (`/api/mcp`)

The app exposes a deployed, Streamable-HTTP MCP endpoint at
[`app/api/mcp/route.ts`](./app/api/mcp/route.ts) so logged-in users can drive
their board from Claude Code. It is **public in the routing sense** (excluded
from the login-cookie gate, alongside `/api/register`) but **guarded by a
per-user bearer token** — it authenticates itself, so the login gate would
otherwise wrongly redirect the MCP client to `/login`.

- **Tokens are hashed at rest.** Only a SHA-256 digest (`token_hash`) and a
  short display prefix (e.g. `hpt_live_a1b2`) are stored in the `api_tokens`
  table — never the plaintext secret. A DB leak therefore never exposes a live
  token. Verification hashes the incoming bearer and matches the digest
  (`lib/mcp/auth.ts`).
- **Shown once.** The full secret is returned exactly once at creation (in
  `/settings` → API tokens) and is never retrievable again. Lost token → revoke
  and mint a new one.
- **Optional expiry.** A token may carry an `expires_at`; an expired token is
  rejected with 401 before any tool runs. Expiry is optional (null = never).
- **Revocation is instant.** Revoking deletes the row, so the next request with
  that token fails the hash lookup and gets 401. A user can only revoke their
  own tokens.
- **Acts as the owner.** Every MCP tool call resolves the token to its owning
  user and acts as that user — a token cannot impersonate anyone else. Writes go
  through the same actor-scoped core (`lib/hiring/core.ts`) as the web UI.
- **Scope.** Tokens grant board read + candidate/feedback writes (no structural
  job/stage mutations). Treat a token like a password.
- No new environment variables are required; the endpoint needs the existing
  `DATABASE_URL` and must be reachable over HTTPS for Claude Code.
