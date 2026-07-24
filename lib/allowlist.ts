import 'server-only';

// Signup allowlist — only listed emails may register (enforced in /api/register, managed on /members).

import { asc, eq } from 'drizzle-orm';
import { db, allowedEmails } from '@/lib/db';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getAllowedEmails(): Promise<
  { id: number; email: string }[]
> {
  const rows = await db
    .select({ id: allowedEmails.id, email: allowedEmails.email })
    .from(allowedEmails)
    .orderBy(asc(allowedEmails.email));
  return rows;
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: allowedEmails.id })
    .from(allowedEmails)
    .where(eq(allowedEmails.email, normalizeEmail(email)))
    .limit(1);
  return !!row;
}
