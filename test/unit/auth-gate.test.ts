import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  evaluateAccess,
  gateMatchesPath,
  resolveUserId,
  credentialsSchema,
  GATE_MATCHER,
  LOGIN_PATH,
  CHANGE_PASSWORD_PATH
} from '@/lib/auth-policy';

// Security coverage for the auth gate, beyond the happy path. These exercise the
// framework-free policy (lib/auth-policy) that lib/auth.ts + middleware.ts wrap,
// so the whole-app login gate, the forced first-login password-change
// confinement, and the Server-Action session guard are validated without a Next
// runtime. See SECURITY.md → "Authentication model" and "Mutations are not
// gated by the middleware".

describe('evaluateAccess — the whole-app login gate', () => {
  it('lets the sign-in page through for an anonymous visitor (only public route)', () => {
    expect(
      evaluateAccess({
        pathname: LOGIN_PATH,
        isLoggedIn: false,
        mustChangePassword: false
      })
    ).toEqual({ type: 'public' });
  });

  it('treats the sign-in page as public even for a signed-in user', () => {
    expect(
      evaluateAccess({
        pathname: LOGIN_PATH,
        isLoggedIn: true,
        mustChangePassword: false
      })
    ).toEqual({ type: 'public' });
  });

  it('denies an unauthenticated request to any other page (→ redirect to login)', () => {
    for (const pathname of ['/', '/members', '/settings', CHANGE_PASSWORD_PATH]) {
      expect(
        evaluateAccess({ pathname, isLoggedIn: false, mustChangePassword: false })
      ).toEqual({ type: 'unauthenticated' });
    }
  });

  it('allows a signed-in, unflagged user onto normal pages', () => {
    for (const pathname of ['/', '/members', '/settings']) {
      expect(
        evaluateAccess({ pathname, isLoggedIn: true, mustChangePassword: false })
      ).toEqual({ type: 'allow' });
    }
  });
});

describe('evaluateAccess — forced first-login password change (privilege confinement)', () => {
  it('confines a flagged account to /change-password from every other page', () => {
    for (const pathname of ['/', '/members', '/settings']) {
      expect(
        evaluateAccess({ pathname, isLoggedIn: true, mustChangePassword: true })
      ).toEqual({ type: 'redirect', to: CHANGE_PASSWORD_PATH });
    }
  });

  it('lets a flagged account reach /change-password itself', () => {
    expect(
      evaluateAccess({
        pathname: CHANGE_PASSWORD_PATH,
        isLoggedIn: true,
        mustChangePassword: true
      })
    ).toEqual({ type: 'allow' });
  });

  it('redirects a cleared account away from /change-password back to the board', () => {
    expect(
      evaluateAccess({
        pathname: CHANGE_PASSWORD_PATH,
        isLoggedIn: true,
        mustChangePassword: false
      })
    ).toEqual({ type: 'redirect', to: '/' });
  });

  it('still requires authentication before the change-password confinement applies', () => {
    // An anonymous request is denied outright — the flag is a *signed-in* state.
    expect(
      evaluateAccess({
        pathname: '/',
        isLoggedIn: false,
        mustChangePassword: true
      })
    ).toEqual({ type: 'unauthenticated' });
  });
});

describe('gateMatchesPath — which requests reach the auth gate', () => {
  it('gates every page route', () => {
    for (const pathname of [
      '/',
      '/members',
      '/settings',
      '/change-password',
      '/login',
      '/candidates/42'
    ]) {
      expect(gateMatchesPath(pathname)).toBe(true);
    }
  });

  it('does NOT gate the NextAuth / register API routes', () => {
    for (const pathname of [
      '/api/auth/callback/credentials',
      '/api/register'
    ]) {
      expect(gateMatchesPath(pathname)).toBe(false);
    }
  });

  it('keeps the api/ exclusion anchored so a page starting with "api" is still gated', () => {
    // Regression guard: a future /api-docs page must not slip through ungated.
    expect(gateMatchesPath('/api-docs')).toBe(true);
  });

  it('does NOT gate Next internals or static assets', () => {
    for (const pathname of [
      '/_next/static/chunk.js',
      '/_next/image',
      '/favicon.ico',
      '/logo.svg',
      '/photo.png',
      '/site.webmanifest'
    ]) {
      expect(gateMatchesPath(pathname)).toBe(false);
    }
  });

  it('middleware.ts inlines the exact GATE_MATCHER pattern (drift guard)', () => {
    // Next statically analyses `config.matcher` at build time and rejects a
    // non-literal value, so middleware.ts cannot import GATE_MATCHER — it embeds
    // an identical copy. Assert the copy matches so the two never diverge and
    // leave a route wrongly gated (or wrongly public). Backslashes in the runtime
    // pattern appear doubled in the single-quoted source literal.
    const src = readFileSync(new URL('../../middleware.ts', import.meta.url), 'utf8');
    const asSourceLiteral = GATE_MATCHER.replace(/\\/g, '\\\\');
    expect(src).toContain(asSourceLiteral);
  });
});

describe('resolveUserId — the Server-Action session guard', () => {
  it('returns the numeric id for a signed-in session', () => {
    expect(resolveUserId({ user: { id: '7' } })).toBe(7);
  });

  it('throws Unauthorized when there is no session at all', () => {
    expect(() => resolveUserId(null)).toThrow('Unauthorized');
    expect(() => resolveUserId(undefined)).toThrow('Unauthorized');
  });

  it('throws Unauthorized when the session carries no user', () => {
    expect(() => resolveUserId({})).toThrow('Unauthorized');
    expect(() => resolveUserId({ user: null })).toThrow('Unauthorized');
  });

  it('throws Unauthorized for a missing, non-numeric, or zero id (no spoofing in)', () => {
    expect(() => resolveUserId({ user: {} })).toThrow('Unauthorized');
    expect(() => resolveUserId({ user: { id: 'abc' } })).toThrow('Unauthorized');
    expect(() => resolveUserId({ user: { id: '0' } })).toThrow('Unauthorized');
    expect(() => resolveUserId({ user: { id: '' } })).toThrow('Unauthorized');
  });

  it('rejects a confined (mustChangePassword) session even with a valid id', () => {
    // The forced first-login confinement must hold at the action guard too, not
    // only the page gate — action ids are POST-able directly. A confined
    // seeded/default-password account must not mutate the board or mint a token.
    expect(() =>
      resolveUserId({ user: { id: '7', mustChangePassword: true } })
    ).toThrow('Unauthorized');
    // A non-confined (or unset/false) flag with a valid id resolves normally.
    expect(
      resolveUserId({ user: { id: '7', mustChangePassword: false } })
    ).toBe(7);
    expect(resolveUserId({ user: { id: '7' } })).toBe(7);
  });
});

describe('credentialsSchema — anomalous sign-in input is rejected', () => {
  it('accepts a well-formed email + non-empty password', () => {
    expect(
      credentialsSchema.safeParse({ email: 'a@b.com', password: 'x' }).success
    ).toBe(true);
  });

  it('rejects a malformed / missing email', () => {
    expect(credentialsSchema.safeParse({ password: 'x' }).success).toBe(false);
    expect(
      credentialsSchema.safeParse({ email: 'not-an-email', password: 'x' })
        .success
    ).toBe(false);
  });

  it('rejects a missing or empty password', () => {
    expect(credentialsSchema.safeParse({ email: 'a@b.com' }).success).toBe(false);
    expect(
      credentialsSchema.safeParse({ email: 'a@b.com', password: '' }).success
    ).toBe(false);
  });

  it('rejects non-string field types (no coercion of anomalous payloads)', () => {
    expect(
      credentialsSchema.safeParse({ email: 123, password: true }).success
    ).toBe(false);
    expect(
      credentialsSchema.safeParse({ email: ['a@b.com'], password: {} }).success
    ).toBe(false);
  });
});
