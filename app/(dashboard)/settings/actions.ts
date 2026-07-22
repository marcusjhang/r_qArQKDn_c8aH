// Manage the signup allowlist and candidate sources from /settings. The whole
// app is gated by the auth middleware, so callers here are authenticated users.

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db, allowedEmails, candidates } from '@/lib/db';
import { sources } from '@/lib/schema/hiring';

const zEmail = z
  .string()
  .trim()
  .email()
  .transform((e) => e.toLowerCase());
const zId = z.number().int().positive();
const zSourceName = z.string().trim().min(1).max(40);

/** Success, or a caller-facing message the settings UI renders inline. */
export type SettingsResult = { ok: true } | { ok: false; error: string };

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

/* ---------- Candidate sources ---------- */

/** Add a candidate source. Duplicate names are rejected (unique by name). */
export async function addSource(nameRaw: string): Promise<SettingsResult> {
  let name: string;
  try {
    name = zSourceName.parse(nameRaw);
  } catch {
    return { ok: false, error: 'Enter a source name (1–40 characters).' };
  }
  const inserted = await db
    .insert(sources)
    .values({ name })
    .onConflictDoNothing()
    .returning({ id: sources.id });
  if (inserted.length === 0) {
    return { ok: false, error: 'That source already exists.' };
  }
  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Rename a source. Candidates reference sources by id, so a rename only relabels
 * — no candidate rows change. Rejects a name already used by another source.
 */
export async function renameSource(
  idRaw: number,
  nameRaw: string
): Promise<SettingsResult> {
  let id: number;
  let name: string;
  try {
    id = zId.parse(idRaw);
    name = zSourceName.parse(nameRaw);
  } catch {
    return { ok: false, error: 'Enter a source name (1–40 characters).' };
  }
  const [clash] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.name, name), ne(sources.id, id)))
    .limit(1);
  if (clash) {
    return { ok: false, error: 'That source already exists.' };
  }
  await db.update(sources).set({ name }).where(eq(sources.id, id));
  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Delete a source. Blocked while any candidate still references it (the FK would
 * otherwise reject the delete) — the caller must reassign those candidates first.
 */
export async function removeSource(idRaw: number): Promise<SettingsResult> {
  let id: number;
  try {
    id = zId.parse(idRaw);
  } catch {
    return { ok: false, error: 'Invalid source.' };
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(candidates)
    .where(eq(candidates.source, id));
  const inUse = Number(n);
  if (inUse > 0) {
    return {
      ok: false,
      error: `In use by ${inUse} candidate${inUse === 1 ? '' : 's'} — reassign them first.`
    };
  }
  await db.delete(sources).where(eq(sources.id, id));
  revalidatePath('/settings');
  return { ok: true };
}
