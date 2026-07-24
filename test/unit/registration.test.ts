import { describe, it, expect, vi, beforeEach } from 'vitest';

// registerUser reaches the allowlist, db, and bcrypt directly, so we mock those
// boundaries. The point is the enumeration-safety contract: only input-validation
// failures report distinctly (400); allowlist-miss, duplicate, and fresh signup
// all resolve to the same uniform { ok: true } shape, so nothing can be enumerated.

const isEmailAllowed = vi.fn<(email: string) => Promise<boolean>>();
const insertValues = vi.fn();
const selectResult = vi.fn<() => Promise<unknown[]>>();

vi.mock('@/lib/allowlist', () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  isEmailAllowed: (email: string) => isEmailAllowed(email)
}));

vi.mock('@/lib/db', () => ({
  users: {},
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => selectResult()
        })
      })
    }),
    insert: () => ({
      values: (v: unknown) => insertValues(v)
    })
  }
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn(async () => 'hashed')
}));

import { hash } from 'bcryptjs';
import {
  registerUser,
  PASSWORD_MIN_LENGTH,
  PASSWORD_COST
} from '@/lib/registration';

const validPassword = 'a'.repeat(PASSWORD_MIN_LENGTH);

beforeEach(() => {
  isEmailAllowed.mockReset();
  insertValues.mockReset();
  selectResult.mockReset();
  selectResult.mockResolvedValue([]);
  // Clear call history only — keep the async impl that returns 'hashed'.
  vi.mocked(hash).mockClear();
});

describe('registerUser input validation (safe to report distinctly)', () => {
  it('returns 400 when email is missing', async () => {
    const result = await registerUser({ password: validPassword });
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Email and password are required'
    });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('returns 400 when password is missing', async () => {
    const result = await registerUser({ email: 'a@b.com' });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('returns 400 when the password is too short', async () => {
    const result = await registerUser({
      email: 'a@b.com',
      password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe('registerUser enumeration safety (uniform outcome)', () => {
  it('does not create an account and reports uniform success when not allowlisted', async () => {
    isEmailAllowed.mockResolvedValue(false);

    const result = await registerUser({
      email: 'stranger@example.com',
      password: validPassword
    });

    expect(result).toEqual({ ok: true, created: false });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('still hashes the password on the non-allowlisted path (uniform timing)', async () => {
    // The allowlist-miss path hashes up front too, so it pays the same bcrypt
    // cost as a real signup and can't be timed apart. Assert the hash ran.
    isEmailAllowed.mockResolvedValue(false);

    await registerUser({
      email: 'stranger@example.com',
      password: validPassword
    });

    expect(hash).toHaveBeenCalledTimes(1);
    expect(hash).toHaveBeenCalledWith(validPassword, PASSWORD_COST);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('does not create a second account and reports uniform success when a duplicate exists', async () => {
    isEmailAllowed.mockResolvedValue(true);
    selectResult.mockResolvedValue([{ id: 1, email: 'dup@example.com' }]);

    const result = await registerUser({
      email: 'dup@example.com',
      password: validPassword
    });

    expect(result).toEqual({ ok: true, created: false });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('creates the account for an allowlisted, non-duplicate email', async () => {
    isEmailAllowed.mockResolvedValue(true);
    selectResult.mockResolvedValue([]);

    const result = await registerUser({
      firstName: ' Ada ',
      lastName: ' Lovelace ',
      email: 'Ada@Example.com',
      password: validPassword
    });

    expect(result).toEqual({ ok: true, created: true });
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      passwordHash: 'hashed'
    });
  });

  it('presents the allowlist-miss, duplicate, and success cases with the same client-visible shape', async () => {
    // `created` is server-side only; the shape the handler sees must be identical
    // across the three cases so no enumeration oracle exists.
    isEmailAllowed.mockResolvedValue(false);
    const miss = await registerUser({
      email: 'miss@example.com',
      password: validPassword
    });

    isEmailAllowed.mockResolvedValue(true);
    selectResult.mockResolvedValue([{ id: 2, email: 'dup@example.com' }]);
    const dup = await registerUser({
      email: 'dup@example.com',
      password: validPassword
    });

    isEmailAllowed.mockResolvedValue(true);
    selectResult.mockResolvedValue([]);
    const created = await registerUser({
      email: 'new@example.com',
      password: validPassword
    });

    for (const r of [miss, dup, created]) {
      expect(r.ok).toBe(true);
    }
    expect(Object.keys(miss).sort()).toEqual(Object.keys(created).sort());
    expect(Object.keys(dup).sort()).toEqual(Object.keys(created).sort());
  });
});
