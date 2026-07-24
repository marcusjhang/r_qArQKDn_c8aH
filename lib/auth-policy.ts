// Framework-free auth/access-control policy — the security-critical decisions,
// kept free of next-auth/next-server imports so they stay unit-testable.

import { z } from 'zod';

/** Public sign-in page — the only route reachable without a session. */
export const LOGIN_PATH = '/login';
/** Forced first-login password-change page for seeded/default-password accounts. */
export const CHANGE_PASSWORD_PATH = '/change-password';

/**
 * Source of truth for which requests reach the auth gate: every page path except
 * API routes, Next internals, and static assets. `middleware.ts` inlines an
 * identical literal (a drift guard in the tests keeps the two in sync).
 */
export const GATE_MATCHER =
  '/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|woff|woff2|ttf|otf|eot|txt|xml|webmanifest)$).*)';

/** Whether `pathname` is one the matcher routes through the auth gate. */
export function gateMatchesPath(pathname: string): boolean {
  return new RegExp(`^${GATE_MATCHER}$`).test(pathname);
}

/** The page gate's decision for one request, framework-free so it stays assertable. */
export type AccessDecision =
  | { type: 'public' }
  | { type: 'allow' }
  | { type: 'unauthenticated' }
  | { type: 'redirect'; to: string };

/**
 * Decide whether a signed-in state may view `pathname`: only LOGIN_PATH is
 * public, and a `mustChangePassword` account is confined to CHANGE_PASSWORD_PATH.
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

/** Minimal session shape the Server-Action guard inspects to resolve the account id. */
export interface SessionLike {
  user?: { id?: unknown; mustChangePassword?: unknown } | null;
}

/**
 * Resolve the signed-in caller's numeric id, throwing `Unauthorized` otherwise —
 * the guard every write action must run itself (the middleware gates pages only,
 * and actions are POST-able to public `/login`). `!id` rejects missing/non-numeric/0;
 * a `mustChangePassword` session is also rejected so a confined account can't mutate
 * via directly POST-able action ids without leaving the shared seeded password.
 */
export function resolveUserId(session: SessionLike | null | undefined): number {
  const id = Number(session?.user?.id);
  if (!id) throw new Error('Unauthorized');
  if (session?.user?.mustChangePassword === true) throw new Error('Unauthorized');
  return id;
}

/** Shape check for the untyped credentials payload; a parse failure is an auth failure, not a throw. */
export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});
