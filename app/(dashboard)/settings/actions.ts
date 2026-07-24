'use server';

// /settings actions (profile, sources, bands, stage limits, tokens); each confirms the session via signedInUserId() because Server Actions bypass the middleware page gate.

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
// Do NOT re-export types from this 'use server' module — Turbopack emits a runtime re-export that 500s /settings (types live in '@/lib/settings-types').

const zId = z.number().int().positive();
const zSourceName = z.string().trim().min(1).max(40);
const zBandLabel = z.string().trim().min(1).max(40);
const zMinYears = z.number().int().min(0).max(MAX_YEARS_EXPERIENCE);
// The one universal stage-warn threshold: 1..MAX_STAGE_WARN_DAYS days.
const zWarnDays = z.number().int().min(1).max(MAX_STAGE_WARN_DAYS);
// First/last optional (some go by one name), capped to column width, trimmed.
const zName = z.string().trim().max(50);

/** Auth guard: the signed-in user's id, or null (returned, not thrown, so callers keep the SettingsResult contract). */
async function signedInUserId(): Promise<number | null> {
  const session = await auth();
  // Reject mustChangePassword sessions too — a shared-default account must not reach these actions by POSTing directly (mirrors resolveUserId).
  if (session?.user?.mustChangePassword === true) return null;
  return Number(session?.user?.id) || null;
}

/** A Postgres unique-violation (SQLSTATE 23505) — caught so a TOCTOU race on the pre-check returns the graceful "already exists" result instead of a 500. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === '23505'
  );
}

/* ---------- Current account profile ---------- */

/** Update the signed-in user's first/last name (the account's name of record; display name + initials are derived). */
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

/** Change the signed-in account's password — verifies the current one (unlike the forced first-login flow); rules live in lib/password.ts. */
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

/** Rename a source (candidates reference sources by id, so this only relabels). Rejects a name used by another source. */
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
  // Case-insensitive clash check — matches the DB's lower(name) unique index.
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

/** Delete a source. Blocked while any candidate still references it (reassign them first). */
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

/** Add a seniority band (years-of-experience → label tier). The threshold (minYears) is unique. */
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

/** Update a band's label and/or threshold. Rejects a threshold used by another band. */
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

/** Set the one universal "warn after N days in a stage" threshold, updating the single pipeline_settings row in place. */
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

/** Mint a new API token: store only the SHA-256 hash + display prefix, return the plaintext secret once (Decision 1). */
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

/** Revoke (delete) one of the signed-in user's tokens. Scoped to the owner. */
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
