'use server';

// Manage the signup allowlist from /members. The allowlist governs who can
// create an account and become a member, so it lives with the members directory
// (moved here from /settings).
//
// The middleware only gates *page* routes; a Server Action can be POSTed to the
// public /login route by action id and bypass that gate, so these actions guard
// themselves with requireUser(). This is the security boundary on the allowlist:
// without it an unauthenticated caller could allowlist their own email and then
// self-register — a full auth bypass.

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db, allowedEmails } from '@/lib/db';

const zEmail = z
  .string()
  .trim()
  .email()
  .transform((e) => e.toLowerCase());
const zId = z.number().int().positive();

export async function addAllowedEmail(emailRaw: string) {
  await requireUser();
  const email = zEmail.parse(emailRaw);
  // Unique constraint + onConflictDoNothing makes re-adding a no-op.
  await db.insert(allowedEmails).values({ email }).onConflictDoNothing();
  revalidatePath('/members');
}

export async function removeAllowedEmail(idRaw: number) {
  await requireUser();
  const id = zId.parse(idRaw);
  await db.delete(allowedEmails).where(eq(allowedEmails.id, id));
  revalidatePath('/members');
}
