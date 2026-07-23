'use server';

// Manage the signed-in profile, candidate sources, and seniority bands from
// /settings. The middleware only gates *page* routes; a Server Action can be
// POSTed to the public /login route by action id and skip that gate, so each
// action confirms the session itself via signedInUserId(). (The signup
// allowlist is managed from /members — see app/(dashboard)/members/actions.ts.)

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db, candidates, users, apiTokens } from '@/lib/db';
import { sources, seniorityBands } from '@/lib/schema/hiring';
import { MAX_YEARS_EXPERIENCE } from '@/lib/hiring/primitives';
import { auth } from '@/lib/auth';
import type { SettingsResult, CreateTokenResult } from '@/lib/settings-types';
import { mintToken } from '@/lib/mcp/auth';

const zId = z.number().int().positive();
const zSourceName = z.string().trim().min(1).max(40);
const zBandLabel = z.string().trim().min(1).max(40);
const zMinYears = z.number().int().min(0).max(MAX_YEARS_EXPERIENCE);
// First/last are optional (some people go by one name); each capped to the
// column width. Trimmed before storing.
const zName = z.string().trim().max(50);

// Re-exported so existing consumers that import the result type from this
// actions module keep working; the canonical declaration lives in
// lib/settings-types.ts.
export type { SettingsResult };

/**
 * Auth guard for these actions: the signed-in user's id, or null when there is
 * no session. Returned (not thrown) so callers keep the SettingsResult contract
 * the UI renders inline. See the file header for why the middleware gate does
 * not cover Server Actions.
 */
async function signedInUserId(): Promise<number | null> {
  const session = await auth();
  return Number(session?.user?.id) || null;
}

/* ---------- Current account profile ---------- */

/**
 * Update the signed-in user's first/last name. These are the account's name of
 * record; the display name and avatar initials (first word + last word) are
 * derived from them (see lib/hiring/helpers.ts). The board picks up the new name
 * on its next server render (its reads are uncached) and its own TanStack Query
 * cache re-seed.
 */
export async function updateProfile(
  firstNameRaw: string,
  lastNameRaw: string
): Promise<SettingsResult> {
  const id = await signedInUserId();
  if (!id) return { ok: false, error: 'Not signed in.' };

  let firstName: string;
  let lastName: string;
  try {
    firstName = zName.parse(firstNameRaw);
    lastName = zName.parse(lastNameRaw);
  } catch {
    return { ok: false, error: 'Names must be 50 characters or fewer.' };
  }
  if (!firstName && !lastName) {
    return { ok: false, error: 'Enter a first or last name.' };
  }

  await db
    .update(users)
    .set({ firstName: firstName || null, lastName: lastName || null })
    .where(eq(users.id, id));

  revalidatePath('/settings');
  return { ok: true };
}

/* ---------- Candidate sources ---------- */

/** Add a candidate source. Duplicate names are rejected (unique by name). */
export async function addSource(nameRaw: string): Promise<SettingsResult> {
  if (!(await signedInUserId())) return { ok: false, error: 'Not signed in.' };
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
  if (!(await signedInUserId())) return { ok: false, error: 'Not signed in.' };
  let id: number;
  let name: string;
  try {
    id = zId.parse(idRaw);
    name = zSourceName.parse(nameRaw);
  } catch {
    return { ok: false, error: 'Enter a source name (1–40 characters).' };
  }
  // Case-insensitive clash check — matches the DB's lower(name) unique index so
  // "LinkedIn" and "linkedin" are treated as the same source.
  const [clash] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(sql`lower(${sources.name}) = lower(${name})`, ne(sources.id, id)))
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
  if (!(await signedInUserId())) return { ok: false, error: 'Not signed in.' };
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
      error: `In use by ${inUse} candidate${inUse === 1 ? '' : 's'}. Reassign them first.`
    };
  }
  await db.delete(sources).where(eq(sources.id, id));
  revalidatePath('/settings');
  return { ok: true };
}

/* ---------- Seniority bands ---------- */

/**
 * Add a seniority band (a years-of-experience → label tier). The threshold
 * (minYears) is unique, so two bands can't start at the same year.
 */
export async function addBand(
  labelRaw: string,
  minYearsRaw: number
): Promise<SettingsResult> {
  if (!(await signedInUserId())) return { ok: false, error: 'Not signed in.' };
  let label: string;
  let minYears: number;
  try {
    label = zBandLabel.parse(labelRaw);
    minYears = zMinYears.parse(minYearsRaw);
  } catch {
    return {
      ok: false,
      error: `Enter a label (1–40 chars) and a threshold of 0–${MAX_YEARS_EXPERIENCE}.`
    };
  }
  const inserted = await db
    .insert(seniorityBands)
    .values({ label, minYears })
    .onConflictDoNothing()
    .returning({ id: seniorityBands.id });
  if (inserted.length === 0) {
    return { ok: false, error: 'A band with that threshold already exists.' };
  }
  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Update a band's label and/or threshold. Rejects a threshold already used by
 * another band. Bands aren't referenced by candidates (seniority is derived),
 * so editing only relabels/retiers — no candidate rows change.
 */
export async function updateBand(
  idRaw: number,
  labelRaw: string,
  minYearsRaw: number
): Promise<SettingsResult> {
  if (!(await signedInUserId())) return { ok: false, error: 'Not signed in.' };
  let id: number;
  let label: string;
  let minYears: number;
  try {
    id = zId.parse(idRaw);
    label = zBandLabel.parse(labelRaw);
    minYears = zMinYears.parse(minYearsRaw);
  } catch {
    return {
      ok: false,
      error: `Enter a label (1–40 chars) and a threshold of 0–${MAX_YEARS_EXPERIENCE}.`
    };
  }
  const [clash] = await db
    .select({ id: seniorityBands.id })
    .from(seniorityBands)
    .where(and(eq(seniorityBands.minYears, minYears), ne(seniorityBands.id, id)))
    .limit(1);
  if (clash) {
    return { ok: false, error: 'A band with that threshold already exists.' };
  }
  await db
    .update(seniorityBands)
    .set({ label, minYears })
    .where(eq(seniorityBands.id, id));
  revalidatePath('/settings');
  return { ok: true };
}

/** Delete a band. Safe any time — candidates don't reference bands. */
export async function removeBand(idRaw: number): Promise<SettingsResult> {
  if (!(await signedInUserId())) return { ok: false, error: 'Not signed in.' };
  let id: number;
  try {
    id = zId.parse(idRaw);
  } catch {
    return { ok: false, error: 'Invalid band.' };
  }
  await db.delete(seniorityBands).where(eq(seniorityBands.id, id));
  revalidatePath('/settings');
  return { ok: true };
}

/* ---------- API tokens (MCP access) ---------- */

const zTokenName = z.string().trim().min(1).max(40);
// Optional expiry: 0 = never, else a fixed number of days from now.
const zExpiryDays = z.union([
  z.literal(0),
  z.literal(30),
  z.literal(60),
  z.literal(90)
]);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Build the exact Claude Code connection command for this deployment + token. */
async function mcpAddCommand(token: string): Promise<string> {
  const h = await headers();
  const host =
    h.get('x-forwarded-host') ?? h.get('host') ?? 'your-app.example.com';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const url = `${proto}://${host}/api/mcp`;
  return `claude mcp add --transport http hiring ${url} --header "Authorization: Bearer ${token}"`;
}

/**
 * Mint a new API token for the signed-in user. Stores only the SHA-256 hash and
 * a display prefix; returns the plaintext secret once (Decision 1).
 */
export async function createApiToken(
  nameRaw: string,
  expiresInDaysRaw: number
): Promise<CreateTokenResult> {
  let name: string;
  let expiresInDays: 0 | 30 | 60 | 90;
  try {
    name = zTokenName.parse(nameRaw);
    expiresInDays = zExpiryDays.parse(expiresInDaysRaw);
  } catch {
    return { ok: false, error: 'Enter a token name (1–40 characters).' };
  }

  const userId = await signedInUserId();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const { token, tokenHash, prefix } = mintToken();
  const expiresAt =
    expiresInDays > 0 ? new Date(Date.now() + expiresInDays * DAY_MS) : null;

  await db
    .insert(apiTokens)
    .values({ userId, name, tokenHash, prefix, expiresAt });

  revalidatePath('/settings');
  return { ok: true, token, prefix, command: await mcpAddCommand(token) };
}

/**
 * Revoke (delete) one of the signed-in user's tokens. Scoped to the owner, so a
 * user can only revoke their own tokens. Deleting the row is instant revocation.
 */
export async function revokeApiToken(idRaw: number): Promise<SettingsResult> {
  let id: number;
  try {
    id = zId.parse(idRaw);
  } catch {
    return { ok: false, error: 'Invalid token.' };
  }

  const userId = await signedInUserId();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));

  revalidatePath('/settings');
  return { ok: true };
}
