import 'server-only';

// Shared, non-action helpers for the write path — plain server-only functions (NOT `'use server'`), so auth/user resolution and the job read/lock live in one place.

import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db, jobs, users } from '@/lib/db';
import type { Status } from '../types';

/** Resolve the caller's numeric id from their session email (not a JWT-captured id, so a reseed that renumbers rows can't misattribute writes). */
export async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return u?.id ?? null;
}

/** Read a job's current traits array outside a transaction, or null if absent. */
export async function loadJobTraits(jobId: number): Promise<string[] | null> {
  const [j] = await db
    .select({ traits: jobs.traits })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return j?.traits ?? null;
}

// The transaction handle Drizzle passes to `db.transaction(cb)`, derived to avoid importing the ORM's transaction types.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Read a job's traits `FOR UPDATE`, row-locking so two concurrent trait edits can't both read the same array and lose the first write. Mirrors `lockJobStages`. */
export async function lockJobTraits(
  tx: Tx,
  jobId: number
): Promise<string[] | null> {
  const [j] = await tx
    .select({ traits: jobs.traits })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .for('update')
    .limit(1);
  return j?.traits ?? null;
}

/** Read a job's stages `FOR UPDATE`, row-locking so concurrent stage edits can't lose a write (or drop a stage a rename just re-pointed candidates into). */
export async function lockJobStages(
  tx: Tx,
  jobId: number
): Promise<string[] | null> {
  const [j] = await tx
    .select({ stages: jobs.stages })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .for('update')
    .limit(1);
  return j?.stages ?? null;
}

/** Merge the stage clock into a placement: reset `stage_entered_at` only on a real stage change, so a no-op move never resets the overdue timer (mirrored by the reducer). */
export function withStageClock(
  placement: { stage: string; status: Status },
  prevStage: string
): { stage: string; status: Status; stageEnteredAt?: Date } {
  return placement.stage === prevStage
    ? placement
    : { ...placement, stageEnteredAt: new Date() };
}
