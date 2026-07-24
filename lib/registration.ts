import 'server-only';

// User-registration domain service — validation and rules for creating an account
// (required fields, password strength, allowlist, duplicate detection), kept free
// of next/server so the rules stay reusable and unit-testable.

import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { isEmailAllowed, normalizeEmail } from '@/lib/allowlist';

/** Minimum password length enforced at signup. */
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt cost factor for stored password hashes (shared with the change-password flow). */
export const PASSWORD_COST = 12;

export interface RegisterInput {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  password?: unknown;
}

/**
 * Result of a registration attempt. Only input-validation failures are reported
 * distinctly (400); every validated request resolves to `ok: true` whether or not
 * an account was created, so allowlist-miss/duplicate/insert are indistinguishable
 * (anti-enumeration). The internal `created` flag is for logging only — never surface it.
 */
export type RegisterResult =
  | { ok: true; created: boolean }
  | { ok: false; error: string; status: 400 };

/**
 * Validate and (when eligible) create a user account. Checks run in order:
 * required fields → password length → allowlist → duplicate → insert. The first
 * two surface as a distinct 400; the rest return the uniform `{ ok: true }` shape
 * so an attacker can't enumerate the allowlist or which emails have accounts.
 */
export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const rawEmail = typeof input.email === 'string' ? input.email : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const firstName =
    typeof input.firstName === 'string' ? input.firstName.trim() : '';
  const lastName =
    typeof input.lastName === 'string' ? input.lastName.trim() : '';

  if (!rawEmail || !password) {
    return {
      ok: false,
      status: 400,
      error: 'Email and password are required'
    };
  }

  // Normalize once so allowlist, duplicate check, and stored value all agree.
  const email = normalizeEmail(rawEmail);

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
    };
  }

  // Hash up front on EVERY validated request so the allowlist-miss and duplicate
  // paths pay the same (bcrypt-dominated) cost as a real signup, closing the
  // timing oracle the uniform `{ ok: true }` body removes. Only stored on insert below.
  const passwordHash = await hash(password, PASSWORD_COST);

  // Allowlist miss returns the success shape, keeping the allowlist unenumerable.
  if (!(await isEmailAllowed(email))) {
    return { ok: true, created: false };
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // A duplicate is likewise indistinguishable: no second account, uniform success shape.
  if (existing) {
    return { ok: true, created: false };
  }

  await db.insert(users).values({
    firstName: firstName || null,
    lastName: lastName || null,
    email,
    passwordHash
  });

  return { ok: true, created: true };
}
