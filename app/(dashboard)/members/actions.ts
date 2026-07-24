'use server';

// Signup-allowlist actions for /members; each self-guards with requireUser() because Server Actions bypass the middleware page gate (else an anonymous caller could self-allowlist + self-register).

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
