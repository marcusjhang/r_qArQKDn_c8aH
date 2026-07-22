'use server';

// Manage the signup allowlist from /settings. The whole app is gated by the
// auth middleware (so callers are authenticated), but managing the allowlist is
// an admin-only capability — server actions are independently invocable
// endpoints, so each one re-checks the role server-side rather than trusting
// the page to have hidden the controls.

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, allowedEmails } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

const zEmail = z
  .string()
  .trim()
  .email()
  .transform((e) => e.toLowerCase());
const zId = z.number().int().positive();

export async function addAllowedEmail(emailRaw: string) {
  if (!(await requireAdmin())) throw new Error('Forbidden');
  const email = zEmail.parse(emailRaw);
  // Unique constraint + onConflictDoNothing makes re-adding a no-op.
  await db.insert(allowedEmails).values({ email }).onConflictDoNothing();
  revalidatePath('/settings');
}

export async function removeAllowedEmail(idRaw: number) {
  if (!(await requireAdmin())) throw new Error('Forbidden');
  const id = zId.parse(idRaw);
  await db.delete(allowedEmails).where(eq(allowedEmails.id, id));
  revalidatePath('/settings');
}
