import { describe, it, expect, vi, beforeEach } from 'vitest';

// The lib/password.ts auth/user-domain services behind the two password-change
// flows:
//   - changePassword  — the forced first-login change (validate confirmation +
//     length, hash, clear mustChangePassword). No current-password check: it
//     replaces the shared seeded default with minimal friction.
//   - updatePassword  — the voluntary change from /settings. Same validation
//     PLUS it verifies the current password first (a stolen/unattended session
//     must not silently take the account over).
// We mock the DB and bcrypt boundaries (like registration.test.ts) and assert
// both the validation contract and the write.

const updateSet = vi.fn();
const updateWhere = vi.fn();
// Row returned by the select in updatePassword; reassigned per test.
let selectRows: Array<{ passwordHash: string }> = [];

vi.mock('@/lib/db', () => ({
  users: {},
  db: {
    update: () => ({
      set: (v: unknown) => {
        updateSet(v);
        return { where: (w: unknown) => updateWhere(w) };
      }
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => selectRows })
      })
    })
  }
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn(async () => 'hashed'),
  compare: vi.fn(async () => true)
}));

import { changePassword, updatePassword } from '@/lib/password';
import { PASSWORD_MIN_LENGTH } from '@/lib/registration';
import { compare } from 'bcryptjs';

const validPassword = 'a'.repeat(PASSWORD_MIN_LENGTH);

beforeEach(() => {
  updateSet.mockReset();
  updateWhere.mockReset();
  selectRows = [{ passwordHash: 'stored-hash' }];
  vi.mocked(compare).mockReset().mockResolvedValue(true as never);
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

// A new password distinct from the current one, both long enough.
const newPassword = 'b'.repeat(PASSWORD_MIN_LENGTH);

describe('updatePassword validation', () => {
  it('rejects when the confirmation does not match', async () => {
    const result = await updatePassword({
      userId: 1,
      currentPassword: validPassword,
      newPassword,
      confirmPassword: `${newPassword}x`
    });
    expect(result).toEqual({ ok: false, error: 'Passwords do not match.' });
    expect(compare).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('rejects a new password shorter than the minimum length', async () => {
    const short = 'b'.repeat(PASSWORD_MIN_LENGTH - 1);
    const result = await updatePassword({
      userId: 1,
      currentPassword: validPassword,
      newPassword: short,
      confirmPassword: short
    });
    expect(result).toMatchObject({ ok: false });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('rejects when the current password is incorrect', async () => {
    vi.mocked(compare).mockResolvedValue(false as never);
    const result = await updatePassword({
      userId: 1,
      currentPassword: 'wrong-password',
      newPassword,
      confirmPassword: newPassword
    });
    expect(result).toEqual({
      ok: false,
      error: 'Current password is incorrect.'
    });
    expect(compare).toHaveBeenCalledWith('wrong-password', 'stored-hash');
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('rejects a reused password (new equals current)', async () => {
    const result = await updatePassword({
      userId: 1,
      currentPassword: validPassword,
      newPassword: validPassword,
      confirmPassword: validPassword
    });
    expect(result).toMatchObject({ ok: false });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('treats non-string input as empty (rejected)', async () => {
    const result = await updatePassword({
      userId: 1,
      currentPassword: undefined,
      newPassword: undefined,
      confirmPassword: undefined
    });
    expect(result).toMatchObject({ ok: false });
    expect(updateSet).not.toHaveBeenCalled();
  });
});

describe('updatePassword success', () => {
  it('verifies the current password, then stores the new hash', async () => {
    const result = await updatePassword({
      userId: 7,
      currentPassword: validPassword,
      newPassword,
      confirmPassword: newPassword
    });
    expect(result).toEqual({ ok: true });
    expect(compare).toHaveBeenCalledWith(validPassword, 'stored-hash');
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({
      passwordHash: 'hashed',
      mustChangePassword: false
    });
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});
