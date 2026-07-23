// Framework-free auth / access-control policy.
//
// The security-critical *decisions* the app makes — which requests reach the
// login gate, whether a given signed-in state may view a page, whether a Server
// Action caller is authenticated, and whether a credentials payload is
// well-formed — live here, deliberately free of any `next-auth` / `next/server`
// import. `lib/auth.ts` wires these into the NextAuth config and adapts the
// results to `NextResponse` / thrown errors; `middleware.ts` consumes the
// matcher. Keeping the pure logic here means it can be exercised in a plain
// Node unit test (the NextAuth config module can't be imported outside a Next
// runtime), so the auth gate is validated beyond the happy path. See
// `SECURITY.md` → "Authentication model" and `test/unit/auth-gate.test.ts`.

import { z } from 'zod';

/** Public sign-in page — the only route reachable without a session. */
export const LOGIN_PATH = '/login';
/** Forced first-login password-change page for seeded/default-password accounts. */
export const CHANGE_PASSWORD_PATH = '/change-password';

/**
 * The middleware matcher (single source of truth, consumed by `middleware.ts`).
 *
 * Everything the app serves as a *page* must reach the auth gate, so the pattern
 * matches every path EXCEPT the NextAuth/register API routes, Next internals,
 * and static assets. The `api/` exclusion is anchored with a trailing slash so a
 * page route that merely starts with "api" (e.g. a future `/api-docs`) is still
 * gated rather than accidentally left public.
 */
export const GATE_MATCHER =
  '/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|woff|woff2|ttf|otf|eot|txt|xml|webmanifest)$).*)';

/**
 * Whether `pathname` is one the matcher routes through the auth gate. Mirrors how
 * Next compiles a `matcher` entry into an anchored, full-path regex, so a unit
 * test can assert no page route slips past the gate and no asset/API route is
 * wrongly gated — without booting the middleware.
 */
export function gateMatchesPath(pathname: string): boolean {
  return new RegExp(`^${GATE_MATCHER}$`).test(pathname);
}

/**
 * The decision the page gate makes for a single request, expressed without any
 * framework type so it is trivially assertable. `lib/auth.ts` maps it to what
 * NextAuth expects:
 *   - `public` / `allow` → `true`
 *   - `unauthenticated`  → `false` (NextAuth redirects to the sign-in page)
 *   - `redirect`         → `NextResponse.redirect(to)`
 */
export type AccessDecision =
  | { type: 'public' }
  | { type: 'allow' }
  | { type: 'unauthenticated' }
  | { type: 'redirect'; to: string };

/**
 * Decide whether a signed-in state may view `pathname`. Pure re-statement of the
 * two gates documented in `SECURITY.md`:
 *   1. The whole app is gated behind login — only `LOGIN_PATH` is public.
 *   2. A signed-in account still carrying the seeded default password
 *      (`mustChangePassword`) is confined to `CHANGE_PASSWORD_PATH` until it
 *      picks a new one; once cleared, that page redirects back to the board.
 */
export function evaluateAccess(params: {
  pathname: string;
  isLoggedIn: boolean;
  mustChangePassword: boolean;
}): AccessDecision {
  const { pathname, isLoggedIn, mustChangePassword } = params;

  if (pathname === LOGIN_PATH) return { type: 'public' };
  if (!isLoggedIn) return { type: 'unauthenticated' };

  if (mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
    return { type: 'redirect', to: CHANGE_PASSWORD_PATH };
  }
  if (!mustChangePassword && pathname === CHANGE_PASSWORD_PATH) {
    return { type: 'redirect', to: '/' };
  }
  return { type: 'allow' };
}

/**
 * Minimal shape of the session the Server-Action guard inspects — just enough
 * to resolve the numeric account id. Kept structural so callers can pass a real
 * NextAuth `Session` or a plain object in tests.
 */
export interface SessionLike {
  user?: { id?: unknown } | null;
}

/**
 * Resolve the signed-in caller's numeric id from a session, throwing
 * `Unauthorized` when there is none. This is the guard every write Server Action
 * must run itself: the middleware gates *page* routes only, and an action can be
 * POSTed to the public `/login` route, so being "behind" a gated page never
 * protects it (see `SECURITY.md` → "Mutations are not gated by the middleware").
 *
 * `!id` rejects a missing session, a non-numeric id, and id `0` alike.
 */
export function resolveUserId(session: SessionLike | null | undefined): number {
  const id = Number(session?.user?.id);
  if (!id) throw new Error('Unauthorized');
  return id;
}

/**
 * Shape check for the untyped credentials payload at the `authorize` boundary.
 * A parse failure is treated as an authentication failure (return null), never a
 * throw — so malformed input can't crash the sign-in handler. Anomalous inputs
 * (missing fields, non-string values, empty password) are rejected here.
 */
export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});
