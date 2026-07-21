'use server';

// Manage the signup allowlist from /settings. The whole app is gated by the
// auth middleware, so callers here are authenticated users.

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, allowedEmails } from '@/lib/db';

const zEmail = z
  .string()
  .trim()
  .email()
  .transform((e) => e.toLowerCase());
const zId = z.number().int().positive();

export async function addAllowedEmail(emailRaw: string) {
  const email = zEmail.parse(emailRaw);
  // Unique constraint + onConflictDoNothing makes re-adding a no-op.
  await db.insert(allowedEmails).values({ email }).onConflictDoNothing();
  revalidatePath('/settings');
}

export async function removeAllowedEmail(idRaw: number) {
  const id = zId.parse(idRaw);
  await db.delete(allowedEmails).where(eq(allowedEmails.id, id));
  revalidatePath('/settings');
}
