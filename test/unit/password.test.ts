import { describe, it, expect, vi, beforeEach } from 'vitest';

// changePassword is the auth/user-domain service behind the forced first-login
// password change: it validates (confirmation match, minimum length), hashes,
// and clears the mustChangePassword flag. We mock the DB and bcrypt boundaries
// (like registration.test.ts) and assert both the validation contract and that
// a successful change writes the new hash AND clears the flag.

const updateSet = vi.fn();
const updateWhere = vi.fn();

vi.mock('@/lib/db', () => ({
  users: {},
  db: {
    update: () => ({
      set: (v: unknown) => {
        updateSet(v);
        return { where: (w: unknown) => updateWhere(w) };
      }
    })
  }
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn(async () => 'hashed')
}));

import { changePassword } from '@/lib/password';
import { PASSWORD_MIN_LENGTH } from '@/lib/registration';

const validPassword = 'a'.repeat(PASSWORD_MIN_LENGTH);

beforeEach(() => {
  updateSet.mockReset();
  updateWhere.mockReset();
});

describe('changePassword validation', () => {
  it('rejects when the confirmation does not match', async () => {
    const result = await changePassword({
      userId: 1,
      password: validPassword,
      confirmPassword: `${validPassword}x`
    });
    expect(result).toEqual({ ok: false, error: 'Passwords do not match.' });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than the minimum length', async () => {
    const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);
    const result = await changePassword({
      userId: 1,
      password: short,
      confirmPassword: short
    });
    expect(result).toMatchObject({ ok: false });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('treats non-string input as empty (rejected)', async () => {
    const result = await changePassword({
      userId: 1,
      password: undefined,
      confirmPassword: undefined
    });
    expect(result).toMatchObject({ ok: false });
    expect(updateSet).not.toHaveBeenCalled();
  });
});

describe('changePassword success', () => {
  it('stores the new hash and clears the mustChangePassword flag', async () => {
    const result = await changePassword({
      userId: 7,
      password: validPassword,
      confirmPassword: validPassword
    });
    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({
      passwordHash: 'hashed',
      mustChangePassword: false
    });
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});
