import { describe, it, expect } from 'vitest';
import {
  gateDecision,
  resolveUserId,
  LOGIN_PATH,
  CHANGE_PASSWORD_PATH
} from '@/lib/auth-gate';

// The `authorized` gate in lib/auth.ts is the app's core custom server-side
// security logic, but that module constructs NextAuth and the DB client at
// import time, so the branching is extracted to the pure `gateDecision` /
// `resolveUserId` here and tested directly — covering the awkward paths beyond
// the "signed in, board request" happy path: the public login page, the
// unauthenticated deny, and both directions of the forced-password-change
// confinement.

describe('gateDecision — public login page', () => {
  it('allows /login for an unauthenticated visitor', () => {
    expect(gateDecision(LOGIN_PATH, null)).toEqual({ type: 'allow' });
    expect(gateDecision(LOGIN_PATH, undefined)).toEqual({ type: 'allow' });
  });

  it('allows /login even for a must-change account (it can always reach sign-in)', () => {
    expect(
      gateDecision(LOGIN_PATH, { mustChangePassword: true })
    ).toEqual({ type: 'allow' });
  });
});

describe('gateDecision — unauthenticated', () => {
  it('denies a protected page when there is no session', () => {
    expect(gateDecision('/', null)).toEqual({ type: 'deny' });
    expect(gateDecision('/members', undefined)).toEqual({ type: 'deny' });
  });

  it('denies the change-password page too when unauthenticated', () => {
    // /change-password is not public — only /login is.
    expect(gateDecision(CHANGE_PASSWORD_PATH, null)).toEqual({ type: 'deny' });
  });
});

describe('gateDecision — forced first-login password change', () => {
  it('redirects a must-change account away from any other page to /change-password', () => {
    expect(gateDecision('/', { mustChangePassword: true })).toEqual({
      type: 'redirect',
      to: CHANGE_PASSWORD_PATH
    });
    expect(gateDecision('/members', { mustChangePassword: true })).toEqual({
      type: 'redirect',
      to: CHANGE_PASSWORD_PATH
    });
  });

  it('lets a must-change account stay on /change-password', () => {
    expect(
      gateDecision(CHANGE_PASSWORD_PATH, { mustChangePassword: true })
    ).toEqual({ type: 'allow' });
  });

  it('redirects a settled account off /change-password back to the board', () => {
    expect(gateDecision(CHANGE_PASSWORD_PATH, { mustChangePassword: false })).toEqual(
      { type: 'redirect', to: '/' }
    );
  });

  it('allows a settled account on a normal page', () => {
    expect(gateDecision('/', { mustChangePassword: false })).toEqual({
      type: 'allow'
    });
  });
});

describe('gateDecision — strict mustChangePassword handling', () => {
  it('treats an absent flag as "no forced change" (allows the page)', () => {
    expect(gateDecision('/', {})).toEqual({ type: 'allow' });
    expect(gateDecision(CHANGE_PASSWORD_PATH, {})).toEqual({
      type: 'redirect',
      to: '/'
    });
  });

  it('does not treat a truthy-but-not-true flag as forcing a change', () => {
    // Only the exact boolean `true` confines the account; a stray truthy value
    // (e.g. a stale/miscoerced JWT claim) must not silently lock a user out.
    const user = { mustChangePassword: 1 as unknown as boolean };
    expect(gateDecision('/', user)).toEqual({ type: 'allow' });
  });
});

describe('resolveUserId', () => {
  it('returns the numeric id for a valid string id', () => {
    expect(resolveUserId('5')).toBe(5);
  });

  it('returns the numeric id for a valid number id', () => {
    expect(resolveUserId(42)).toBe(42);
  });

  it('rejects undefined / null / empty string', () => {
    expect(resolveUserId(undefined)).toBeNull();
    expect(resolveUserId(null)).toBeNull();
    expect(resolveUserId('')).toBeNull();
  });

  it('rejects "0" and 0 (there is no user 0)', () => {
    expect(resolveUserId('0')).toBeNull();
    expect(resolveUserId(0)).toBeNull();
  });

  it('rejects non-numeric strings (NaN)', () => {
    expect(resolveUserId('abc')).toBeNull();
    expect(resolveUserId('12abc')).toBeNull();
  });

  it('rejects non-finite numbers', () => {
    expect(resolveUserId(Infinity)).toBeNull();
    expect(resolveUserId(NaN)).toBeNull();
  });
});
