'use server';

// Manage the signed-in profile, candidate sources, seniority bands, and stage
// time-limits from /settings. The middleware only gates *page* routes; a Server
// Action can be POSTed to the public /login route by action id and skip that
// gate, so each action confirms the session itself via signedInUserId(). (The
// signup allowlist is managed from /members — see app/(dashboard)/members/actions.ts.)

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { db, candidates, users, apiTokens } from '@/lib/db';
import { sources, seniorityBands, pipelineSettings } from '@/lib/schema/hiring';
import {
  MAX_YEARS_EXPERIENCE,
  MAX_STAGE_WARN_DAYS
} from '@/lib/hiring/primitives';
import { auth } from '@/lib/auth';
import type { SettingsResult, CreateTokenResult } from '@/lib/settings-types';
import { mintToken } from '@/lib/mcp/auth';
import { updatePassword as updatePasswordService } from '@/lib/password';
// NOTE: this is a 'use server' module — Next.js requires it to export ONLY async
// Server Actions. Do NOT re-export the SettingsResult type from here (even via
// `export type`): Turbopack emits a runtime re-export for it, which fails at
// request time with "Export SettingsResult doesn't exist" and 500s /settings.
// Consumers import the type from '@/lib/settings-types' (its canonical home).

const zId = z.number().int().positive();
const zSourceName = z.string().trim().min(1).max(40);
const zBandLabel = z.string().trim().min(1).max(40);
const zMinYears = z.number().int().min(0).max(MAX_YEARS_EXPERIENCE);
// The one universal stage-warn threshold: at least a day, at most
// MAX_STAGE_WARN_DAYS.
const zWarnDays = z.number().int().min(1).max(MAX_STAGE_WARN_DAYS);
// First/last are optional (some people go by one name); each capped to the
// column width. Trimmed before storing.
const zName = z.string().trim().max(50);

/**
 * Auth guard for these actions: the signed-in user's id, or null when there is
 * no session. Returned (not thrown) so callers keep the SettingsResult contract
 * the UI renders inline. See the file header for why the middleware gate does
 * not cover Server Actions.
 */
async function signedInUserId(): Promise<number | null> {
  const session = await auth();
  // Reject a session still confined to the forced first-login password change
  // (mustChangePassword) — not only signed-out callers — so a shared-default
  // account can't reach these actions (e.g. mint an API token) by POSTing the
  // action directly. Mirrors resolveUserId (lib/auth-policy).
  if (session?.user?.mustChangePassword === true) return null;
  return Number(session?.user?.id) || null;
}

/**
 * A Postgres unique-violation (SQLSTATE 23505). The rename/update actions below
 * pre-check for a name clash with a SELECT, but that read-then-write has a TOCTOU
 * window: two concurrent renames to the same name both pass the SELECT, then the
 * second UPDATE trips the case-insensitive unique index. Catching that lets the
 * action return the same graceful "already exists" result instead of throwing an
 * unhandled 500 — the DB stays the source of truth, the pre-check just improves
 * the common-case message.
 */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === '23505'
  );
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

/**
 * Change the signed-in account's password (Security panel). A voluntary change,
 * so unlike the forced first-login flow it verifies the current password — the
 * rules live in the lib/password.ts domain service and this stays a thin adapter
 * that confirms the session first (the middleware never gates Server Actions).
 * The stored password isn't part of the session token, so no re-auth is needed;
 * the user stays signed in.
 */
export async function updatePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<SettingsResult> {
  const id = await signedInUserId();
  if (!id) return { ok: false, error: 'Not signed in.' };

  return updatePasswordService({
    userId: id,
    currentPassword,
    newPassword,
    confirmPassword
  });
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
  try {
    await db.update(sources).set({ name }).where(eq(sources.id, id));
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false, error: 'That source already exists.' };
    }
    throw e;
  }
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
  try {
    await db
      .update(seniorityBands)
      .set({ label, minYears })
      .where(eq(seniorityBands.id, id));
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false, error: 'A band with that threshold already exists.' };
    }
    throw e;
  }
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

/* ---------- Stage warn threshold (pipeline settings) ---------- */

/**
 * Set the one universal "warn after N days in a stage" threshold — the board
 * flags a candidate as overdue once they have sat in their current stage for at
 * least this many whole days, applied to every stage. Updates the single
 * pipeline_settings row in place (inserting it if the table is somehow empty).
 * The board picks up the change on its next (uncached) server render.
 */
export async function updateStageWarnDays(
  daysRaw: number
): Promise<SettingsResult> {
  if (!(await signedInUserId())) return { ok: false, error: 'Not signed in.' };
  let days: number;
  try {
    days = zWarnDays.parse(daysRaw);
  } catch {
    return {
      ok: false,
      error: `Enter a number of days from 1 to ${MAX_STAGE_WARN_DAYS}.`
    };
  }
  const [existing] = await db
    .select({ id: pipelineSettings.id })
    .from(pipelineSettings)
    .orderBy(asc(pipelineSettings.id))
    .limit(1);
  if (existing) {
    await db
      .update(pipelineSettings)
      .set({ stageWarnDays: days })
      .where(eq(pipelineSettings.id, existing.id));
  } else {
    await db.insert(pipelineSettings).values({ stageWarnDays: days });
  }
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
