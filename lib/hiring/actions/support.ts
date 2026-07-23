import 'server-only';

// Shared, non-action helpers for the server-action write path. These are plain
// server-only functions (NOT `'use server'` — they are never exposed as
// callable server actions); the entity action modules (./jobs, ./candidates,
// ./feedback, ./stages) import them so the auth/user resolution and the job-
// stages read/lock live in one place rather than duplicated per module.

import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db, jobs, users } from '@/lib/db';
import type { Status } from '../types';

/**
 * Resolve the signed-in caller's numeric id from their session email against
 * the live `users` table — the author of a write is derived here, never taken
 * from client input. Mirrors chat-actions/chat-logic: resolving by email (the
 * stable login identity) rather than trusting a JWT-captured id keeps a reseed
 * that renumbers the rows from attributing feedback to the wrong account, and
 * keeps a caller from fabricating feedback authored by a colleague.
 */
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

// The transaction handle Drizzle passes to `db.transaction(cb)`, derived so we
// don't have to import the ORM's transaction types.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Read a job's stages inside a transaction with `SELECT … FOR UPDATE`, taking a
 * row lock so a concurrent stage edit blocks until this transaction commits.
 * The stage mutations (add/rename/reorder/delete) all read-modify-write the
 * whole `stages` array, so without this lock two concurrent edits both read the
 * same array and the second write silently clobbers the first — and a stale
 * write can drop a stage a rename just re-pointed candidates into, orphaning
 * them. Locking the job row serializes those edits per job.
 */
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

/**
 * Merge the stage clock into a (stage, status) placement: reset
 * `stage_entered_at` to now ONLY when the placement moves the candidate to a
 * different stage. Centralizes the "restart the timer on a real move" rule
 * shared by moveStage and setStatus so the two can't drift, and so a no-op move
 * (re-dropping a card in its own column) never resets the overdue timer. The
 * optimistic client mirror of this rule lives in the reducer.
 */
export function withStageClock(
  placement: { stage: string; status: Status },
  prevStage: string
): { stage: string; status: Status; stageEnteredAt?: Date } {
  return placement.stage === prevStage
    ? placement
    : { ...placement, stageEnteredAt: new Date() };
}
