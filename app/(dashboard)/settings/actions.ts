'use server';

// Administrative actions for /settings: the signup allowlist and user role
// management. The whole app is gated by the auth middleware, so callers here
// are authenticated users; the RBAC checks below gate the privileged bits.

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, allowedEmails, users } from '@/lib/db';
import { auth } from '@/lib/auth';
import { ROLES, canManageAllowlist, canManageRoles, isOwner } from '@/lib/rbac';

const zEmail = z
  .string()
  .trim()
  .email()
  .transform((e) => e.toLowerCase());
const zId = z.number().int().positive();
const zRole = z.enum(ROLES);

// RBAC gate: managing the allowlist is admin+. Server actions are their own
// entry points, so they must enforce this independently of the UI that hides
// the section (never trust the client to have hidden it).
async function assertCanManageAllowlist() {
  const session = await auth();
  if (!canManageAllowlist(session?.user?.role)) {
    throw new Error('Forbidden: you cannot manage the signup allowlist.');
  }
}

export async function addAllowedEmail(emailRaw: string) {
  await assertCanManageAllowlist();
  const email = zEmail.parse(emailRaw);
  // Unique constraint + onConflictDoNothing makes re-adding a no-op.
  await db.insert(allowedEmails).values({ email }).onConflictDoNothing();
  revalidatePath('/settings');
}

export async function removeAllowedEmail(idRaw: number) {
  await assertCanManageAllowlist();
  const id = zId.parse(idRaw);
  await db.delete(allowedEmails).where(eq(allowedEmails.id, id));
  revalidatePath('/settings');
}

// Assign a user's role. Admin+ may manage roles, but the `owner` role is
// special: only an owner may grant it or change someone who is already an
// owner. This stops an admin from minting owners or demoting the owner.
export async function setUserRole(userIdRaw: number, roleRaw: string) {
  const session = await auth();
  const actorRole = session?.user?.role;
  if (!canManageRoles(actorRole)) {
    throw new Error('Forbidden: you cannot manage user roles.');
  }

  const userId = zId.parse(userIdRaw);
  const role = zRole.parse(roleRaw);

  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new Error('User not found.');

  // Only owners may touch the owner role (as source or destination).
  if ((role === 'owner' || target.role === 'owner') && !isOwner(actorRole)) {
    throw new Error('Forbidden: only an owner can grant or change ownership.');
  }

  await db.update(users).set({ role }).where(eq(users.id, userId));
  revalidatePath('/settings');
}
