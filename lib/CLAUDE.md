# lib conventions

Server and shared logic. The hiring domain lives in `lib/hiring/` and the
Drizzle schema in `lib/schema/` (each has its own CLAUDE.md). The files directly
under `lib/` are the auth/user domain and shared plumbing.

## Modules

- `auth.ts` — the Auth.js (next-auth v5 beta) config: credentials provider and
  the `authorized` callback that gates the app. Exported as the middleware.
- `auth-gate.ts` — the pure, dependency-free decision logic behind that gate
  (`gateDecision`, `resolveUserId`). No next-auth / DB / `server-only` imports,
  so the security-critical branching is unit-testable in isolation
  (`test/unit/auth-gate.test.ts`); `auth.ts` is a thin adapter over it.
- `allowlist.ts` (`server-only`) — the signup allowlist; only listed emails may
  register. Managed from `/settings`.
- `registration.ts` (`server-only`) — the account-creation domain service
  (required fields, password strength, allowlist check, duplicate detection) so
  the `/api/register` route stays a thin adapter. This is the auth/user domain,
  deliberately kept out of `lib/hiring/`.
- `db.ts` (`server-only`) — the single Drizzle client (`postgres-js` + Neon),
  wired to `@/lib/schema`. Import the `db` singleton and tables from here.
- `utils.ts` — framework-agnostic helpers (e.g. `cn`).

## Conventions

- Any module that touches the database, secrets, or Node-only APIs starts with
  `import 'server-only';` so it can never be pulled into a client bundle.
- Password hashing uses `bcryptjs`; never log or return secrets. Auth env vars
  (`SEED_PASSWORD`, NextAuth secret) are documented in `.env.example` — keep
  `SECURITY.md` in sync when they change.

Auth, allowlist, registration, and secret handling are covered in depth by the
**auth** skill; database reads/schema by the **drizzle** skill.
