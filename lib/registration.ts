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
/** bcrypt cost factor for stored password hashes (shared with the change-password flow). */
export const PASSWORD_COST = 12;

export interface RegisterInput {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  password?: unknown;
}

/**
 * Result of a registration attempt.
 *
 * Only genuine input-validation failures (`ok: false`) are reported distinctly
 * to the caller — a malformed request tells the client nothing about whether
 * any given email is allowlisted or already registered, so a clear 400 is safe
 * and useful.
 *
 * Every request that passes validation resolves to `ok: true` regardless of
 * whether an account was actually created: allowlist-miss, duplicate, and
 * fresh-insert are deliberately indistinguishable to the caller (see
 * `SECURITY.md` → "Registration enumeration"). The internal `created` flag
 * records what really happened for logging/metrics, but MUST NOT be surfaced in
 * the HTTP response — doing so would reintroduce the enumeration oracle.
 */
export type RegisterResult =
  | { ok: true; created: boolean }
  | { ok: false; error: string; status: 400 };

/**
 * Validate and (when eligible) create a user account.
 *
 * Runs the checks in order: required fields → password length → allowlist →
 * duplicate → insert. The first two are input validation and surface as a
 * distinct 400. The allowlist and duplicate checks still fully gate account
 * creation, but they no longer produce a distinct result — a request for an
 * email that is not allowlisted, or that already has an account, returns the
 * same `{ ok: true }` shape as a successful creation so an attacker cannot
 * enumerate the allowlist or which emails have accounts.
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

  // Signups are restricted to the allowlist (managed in /members). A miss is
  // NOT reported distinctly — returning here with the same shape as success
  // keeps the allowlist unenumerable.
  if (!(await isEmailAllowed(email))) {
    return { ok: true, created: false };
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // A duplicate is likewise indistinguishable from a fresh signup: we simply
  // do not create a second account and report the uniform success shape.
  if (existing) {
    return { ok: true, created: false };
  }

  const passwordHash = await hash(password, PASSWORD_COST);

  await db.insert(users).values({
    firstName: firstName || null,
    lastName: lastName || null,
    email,
    passwordHash
  });

  return { ok: true, created: true };
}
