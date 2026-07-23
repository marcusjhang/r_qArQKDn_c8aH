// Pure, framework-free decision logic for the whole-app auth gate. Kept in its
// own module — with no `next-auth`, `next/server`, `@/lib/db`, or `server-only`
// imports — so the security-critical branching can be unit-tested with plain
// inputs, and so `lib/auth.ts` (which constructs NextAuth and pulls in the DB
// client at import time) is a thin adapter over these functions rather than the
// only place the rules can be reached.
//
// This mirrors the extraction pattern used elsewhere in the codebase (the pure
// `decide()` window step in `lib/rate-limit.ts`, the hiring rules in
// `lib/hiring/helpers.ts`): put the decision in a pure function, inject/adapt
// the I/O around it. The auth model stays authentication-only — there are no
// roles here, and none should be introduced (see SECURITY.md + the auth skill).

/** Path of the public sign-in page (the only page route that bypasses the gate). */
export const LOGIN_PATH = '/login';

/** Path of the forced first-login password-change page. */
export const CHANGE_PASSWORD_PATH = '/change-password';

/**
 * The subset of the session user the gate actually reads. Modelled loosely so
 * the pure function never depends on the full next-auth `Session` type.
 */
export interface GateUser {
  mustChangePassword?: boolean;
}

/**
 * Outcome of the page gate:
 *   - `allow`  — the request may proceed.
 *   - `deny`   — no session; NextAuth redirects to `pages.signIn` (`/login`).
 *   - `redirect` — signed in, but confined elsewhere (the must-change flow).
 */
export type GateDecision =
  | { type: 'allow' }
  | { type: 'deny' }
  | { type: 'redirect'; to: string };

/**
 * Decide whether a page request is allowed, denied, or must be redirected.
 * Pure: given the request pathname and the (possibly absent) session user, it
 * returns a decision with no side effects. `lib/auth.ts` maps this onto the
 * `authorized` callback's `boolean | NextResponse` return.
 *
 * Rules, in order:
 *   1. `/login` is always public — even for an unauthenticated visitor, and
 *      even for a must-change account (so it can always reach sign-in).
 *   2. No session → deny (redirect to `/login`).
 *   3. A signed-in account that still carries the seeded default password
 *      (`mustChangePassword === true`) is confined to `/change-password`: every
 *      other page redirects there.
 *   4. Once the flag is cleared, `/change-password` itself redirects back to
 *      the board so a settled account can't linger on it.
 *   5. Otherwise allow.
 *
 * The `=== true` check is deliberate: an absent/undefined flag is treated as
 * "no forced change", never as truthy-by-accident.
 */
export function gateDecision(
  pathname: string,
  user: GateUser | null | undefined
): GateDecision {
  if (pathname === LOGIN_PATH) return { type: 'allow' };
  if (!user) return { type: 'deny' };

  const mustChange = user.mustChangePassword === true;
  if (mustChange && pathname !== CHANGE_PASSWORD_PATH) {
    return { type: 'redirect', to: CHANGE_PASSWORD_PATH };
  }
  if (!mustChange && pathname === CHANGE_PASSWORD_PATH) {
    return { type: 'redirect', to: '/' };
  }
  return { type: 'allow' };
}

/**
 * Resolve the numeric user id from the raw `session.user.id` value used by the
 * Server-Action guard (`requireUser`). Returns the id when it is a positive
 * integer-ish value, or `null` when there is no usable signed-in identity.
 *
 * Pure and total so the guard's "are you signed in" decision is unit-testable
 * without a live session. Everything that isn't a truthy number after coercion
 * — `undefined`, `null`, `''`, `'0'`/`0` (there is no user 0), `'abc'`/`NaN` —
 * resolves to `null`; `requireUser` turns that into an `Unauthorized` throw.
 */
export function resolveUserId(rawId: unknown): number | null {
  const id = Number(rawId);
  if (!id || !Number.isFinite(id)) return null;
  return id;
}
