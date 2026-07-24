import 'server-only';

// Password-change domain service — validation and rules for an account replacing
// its password, kept free of next/server so the rules stay unit-testable.

import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { PASSWORD_MIN_LENGTH, PASSWORD_COST } from '@/lib/registration';
import { compare, hash } from 'bcryptjs';

export interface ChangePasswordInput {
  userId: number;
  password: unknown;
  confirmPassword: unknown;
}

/** Result of a password-change attempt; `ok: false` carries a caller-facing message. */
export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Set a new password and clear the mustChangePassword flag (the first-login gate).
 * Validation: confirm match → min length → not a reuse of the current password —
 * the reuse check stops a confined account keeping the shared seeded default.
 */
export async function changePassword(
  input: ChangePasswordInput
): Promise<ChangePasswordResult> {
  const password = typeof input.password === 'string' ? input.password : '';
  const confirmPassword =
    typeof input.confirmPassword === 'string' ? input.confirmPassword : '';

  if (password !== confirmPassword) {
    return { ok: false, error: 'Passwords do not match.' };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    };
  }

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (row && (await compare(password, row.passwordHash))) {
    return {
      ok: false,
      error: 'Choose a new password — it must differ from your current one.'
    };
  }

  const passwordHash = await hash(password, PASSWORD_COST);

  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(users.id, input.userId));

  return { ok: true };
}

export interface UpdatePasswordInput {
  userId: number;
  currentPassword: unknown;
  newPassword: unknown;
  confirmPassword: unknown;
}

/**
 * Change an already-authenticated account's password from /settings. Unlike the
 * first-login flow it verifies the current password first, so a stolen/unattended
 * session can't take the account over. Validation: confirm match → min length →
 * current correct → new differs; a wrong password and a missing row are indistinguishable.
 */
export async function updatePassword(
  input: UpdatePasswordInput
): Promise<ChangePasswordResult> {
  const currentPassword =
    typeof input.currentPassword === 'string' ? input.currentPassword : '';
  const newPassword =
    typeof input.newPassword === 'string' ? input.newPassword : '';
  const confirmPassword =
    typeof input.confirmPassword === 'string' ? input.confirmPassword : '';

  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'Passwords do not match.' };
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    };
  }

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  // Treat a missing row like a failed check, not a distinct "no such account" outcome.
  const currentValid =
    !!row && (await compare(currentPassword, row.passwordHash));
  if (!currentValid) {
    return { ok: false, error: 'Current password is incorrect.' };
  }

  if (newPassword === currentPassword) {
    return {
      ok: false,
      error: 'New password must be different from your current password.'
    };
  }

  const passwordHash = await hash(newPassword, PASSWORD_COST);

  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(users.id, input.userId));

  return { ok: true };
}
