---
name: auth
description: >-
  How to work with authentication in this repo — the whole-app login gate
  (Auth.js / next-auth v5 beta credentials provider), the middleware matcher
  that decides which routes reach the gate, the signup allowlist + registration
  domain service, and password/secret handling. Covers the exact recipes for
  adding a protected or public route, extending the allowlist/registration flow,
  and keeping SECURITY.md in sync. Use whenever a task touches lib/auth.ts,
  middleware.ts, lib/allowlist.ts, lib/registration.ts, app/api/register/**,
  app/login/**, the /members allowlist UI, SEED_PASSWORD/auth env vars, or
  SECURITY.md. For *reviewing* auth changes, use the pr-code-review skill
  (references/backend.md → "Auth & API routes") — this skill is for authoring
  them.
---

# Working with auth in this repo

Auth.js (**next-auth v5 beta**) with a credentials provider, backed by the
`users` table via Drizzle. This is the **authoring** companion to the
`pr-code-review` skill's `references/backend.md` (Auth & API routes) — that is
the review lens (what to flag); this is the how-to. Auth is security-sensitive:
`SECURITY.md` is the policy of record, so a change here usually means a matching
`SECURITY.md` edit.

## The model: whole-app gate, authentication-only

- The app is gated by the **`authorized` callback in `lib/auth.ts`**, run in
  middleware for every matched route. It is dead simple on purpose: `/login` is
  public, everything else requires a session (`return !!auth?.user`). Returning
  false redirects to `pages.signIn` (`/login`) with a callbackUrl.
- **Authentication-only — there are no roles.** The `role` column/enum was
  removed (PR #25); access is "are you signed in," never "what role." Don't
  reintroduce role-based branching in `authorized` — if you need authorization,
  raise it as a design decision first.
- **Session strategy is `jwt`.** The user `id` is propagated `authorize` →
  `jwt` (`token.id`) → `session` (`session.user.id`), matching the
  `declare module 'next-auth'` augmentation at the top of `lib/auth.ts`. If you
  add a field to the session, add it in all three places **and** the module
  augmentation, or it won't type-check / won't survive the round-trip.
- **`middleware.ts` chooses which requests reach the gate.** It re-exports
  `auth as middleware` and the `config.matcher` regex excludes non-page requests
  (`api/`, `_next/static`, `_next/image`, `favicon.ico`, and anything ending in
  a static-asset extension). Everything else — all page routes — is gated.

## Recipe: add a protected route (the common case)

Nothing to do — **routes are gated by default.** Just add the `app/**` page or
route. Then sanity-check it is *not* accidentally excluded by the matcher:

- A page whose path starts with `api` (e.g. `/api-docs`) must still be gated —
  the `api/` exclusion is anchored with a trailing slash precisely so it isn't
  swept up (PR #14). Confirm your new path doesn't match a static-asset
  extension either.
- If the page reads per-user data, get the session with `auth()` inside the
  Server Component/action; don't trust a client-supplied identity.

## Recipe: make a route public (rare, deliberate)

Only `/login` is public today. To add another public surface:

1. Add an early `return true` for that pathname in `authorized` (mirror the
   `/login` check), **or** exclude it in the `config.matcher`.
2. **Keep matcher exclusions anchored and minimal.** Anchor path prefixes (as
   `api/` is) so a longer page route can't slip through, and only widen the
   static-asset list to genuinely public assets. A loose exclusion that opens
   page routes is a security bug.
3. Update `SECURITY.md` — the public surface is documented there.

## Recipe: registration & the allowlist

Signup is allowlist-restricted and lives behind a thin HTTP adapter:

- **`app/api/register/route.ts` is a thin adapter** — it parses the body, calls
  `registerUser(body)`, and maps the discriminated `RegisterResult`
  (`{ ok: true } | { ok: false; error; status }`) onto `NextResponse`. Keep the
  rules out of the handler.
- **`lib/registration.ts` owns the rules** (`'server-only'`): required fields →
  password length (`PASSWORD_MIN_LENGTH`) → allowlist → duplicate check →
  bcrypt hash (cost 12) → insert. It returns the discriminated result with the
  status the handler should emit (400/403/409). Extend the rules here, not in
  the route.
- **The allowlist is `lib/allowlist.ts`** (`'server-only'`): `normalizeEmail`
  (trim + lowercase — use it everywhere an email is compared/stored),
  `isEmailAllowed`, `getAllowedEmails`. The set is managed on `/members`.
- The client login/signup orchestration (register → `signIn` → redirect) lives
  in `app/login/useLoginForm.ts`, not in the page — see the `server-actions` /
  frontend guidance for the hook pattern.

## Passwords & secrets

- Hash with **bcrypt cost ≥ 12** (`hash` in `lib/registration.ts`), compare with
  `compare` (`lib/auth.ts`). **Never log or return a hash.**
- The seed account password falls back to the well-known default `"password"`;
  override via **`SEED_PASSWORD`** and change it before any non-demo use (this
  warning lives in `SECURITY.md` + `.env.example`).
- New auth/secret env vars go in `.env.example` as **placeholders only**; real
  secrets stay in the git-ignored `.env`. Rotate anything ever committed.

## SECURITY.md is the policy of record

When you change the gate, the matcher exclusions, the allowlist behaviour, or
the env-var/secret story, update `SECURITY.md` in the same change — a stale
`SECURITY.md` is itself a review finding. It documents the auth model, secret
management + rotation, and the default-seed-password warning.

## Cross-links

- Review lens: `pr-code-review` → `references/backend.md` (Auth & API routes,
  the thin-adapter/domain-service split) and the **`security-review`** built-in
  skill.
- DB/schema side of `users` / `allowed_emails`: the **`drizzle`** skill.
- The write-path/hook patterns registration reuses: the **`server-actions`**
  skill.
- Policy: `SECURITY.md`.
