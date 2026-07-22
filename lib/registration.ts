import 'server-only';

// User-registration domain service. Owns the validation and business rules for
// creating an account (required fields, password strength, the signup
// allowlist, and duplicate detection) so the /api/register HTTP handler stays a
// thin adapter. Kept out of lib/hiring/ (this is the auth/user domain, not the
// hiring domain) and free of any next/server dependency so the rules can be
// reused and unit-tested without the HTTP layer.

import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { isEmailAllowed, normalizeEmail } from '@/lib/allowlist';

/** Minimum password length enforced at signup. */
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt cost factor for stored password hashes. */
const PASSWORD_COST = 12;

export interface RegisterInput {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  password?: unknown;
}

/**
 * Result of a registration attempt. On failure it carries the caller-facing
 * message and the HTTP status the API handler should map it to, so the domain
 * owns the rule while the handler owns the transport.
 */
export type RegisterResult =
  | { ok: true }
  | { ok: false; error: string; status: 400 | 403 | 409 };

/**
 * Validate and create a user account. Runs the checks in the same order the
 * handler used to (required → password length → allowlist → duplicate) so the
 * behaviour, messages, and statuses are unchanged.
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

  // Normalize once so the allowlist check, duplicate check, and stored value
  // all agree (login normalizes the same way).
  const email = normalizeEmail(rawEmail);

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
    };
  }

  // Signups are restricted to the allowlist (managed in /settings).
  if (!(await isEmailAllowed(email))) {
    return {
      ok: false,
      status: 403,
      error:
        'This email is not allowed to sign up. Ask an admin to add it in Settings.'
    };
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return {
      ok: false,
      status: 409,
      error: 'An account with this email already exists'
    };
  }

  const passwordHash = await hash(password, PASSWORD_COST);

  await db.insert(users).values({
    firstName: firstName || null,
    lastName: lastName || null,
    email,
    passwordHash
  });

  return { ok: true };
}
