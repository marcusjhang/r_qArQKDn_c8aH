import 'server-only';

// Password-change domain service. Owns the validation and business rules for an
// existing account replacing its password (length check → bcrypt hash → store
// and clear the mustChangePassword flag) so the /change-password server action
// stays a thin adapter. Lives in the auth/user domain alongside registration.ts
// and is free of any next/server dependency so the rules can be unit-tested
// without the HTTP/action layer.

import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { PASSWORD_MIN_LENGTH, PASSWORD_COST } from '@/lib/registration';
import { compare, hash } from 'bcryptjs';

export interface ChangePasswordInput {
  userId: number;
  password: unknown;
  confirmPassword: unknown;
}

/**
 * Result of a password-change attempt. `ok: false` carries a caller-facing
 * message the /change-password UI renders inline.
 */
export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Set a new password for an existing account and clear its mustChangePassword
 * flag (the seeded-account first-login gate — see lib/auth.ts + db/seed.ts).
 *
 * Validation order: confirmation match → minimum length. The caller has already
 * authenticated (the page is auth-gated and the action confirms the session),
 * so this deliberately does not re-check the current password — the whole point
 * of the flow is to replace the shared default with minimal friction.
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
 * Change an already-authenticated account's password from /settings.
 *
 * This is the *voluntary* counterpart to `changePassword` above. Because it is
 * not the minimal-friction first-login flow, it verifies the current password
 * first: a signed-in-but-unattended session, or a stolen session token, must
 * not be able to silently take the account over by setting a new password
 * without knowing the old one.
 *
 * Validation order: confirmation match → minimum length → current password
 * correct → new password differs from the current one. Any failure returns a
 * caller-facing message and writes nothing. A generic "current password is
 * incorrect" is used for both a wrong password and the (defensive) missing-row
 * case, so nothing distinguishes them.
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
  // The caller is authenticated, so the row should exist; treat a miss like a
  // failed check rather than leaking a distinct "no such account" outcome.
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
