'use server';

// Job write actions (create / star / delete). Part of the board's single write
// path — see ./index for the boundary contract (zod-validate → mutate → tagged
// revalidate → store rollback on throw) shared by every action module.

import { and, eq, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { db, jobs } from '@/lib/db';
import { BOARD_TAGS } from '../cache';
import { MAX_FAVORITES } from '../helpers';
import { DEFAULT_STAGES } from '../config';
import { zId, zJobTitle } from '../schemas';

/**
 * Create a new job with the compulsory default stages. Returns the new id so
 * the client can reconcile its optimistic job and switch the board to it.
 */
export async function createJob(titleRaw: string): Promise<number | null> {
  await requireUser();
  const title = zJobTitle.parse(titleRaw);
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${jobs.position}), -1)` })
    .from(jobs);
  const [row] = await db
    .insert(jobs)
    .values({
      title,
      stages: [...DEFAULT_STAGES],
      position: Number(maxPos) + 1
    })
    .returning({ id: jobs.id });
  revalidateTag(BOARD_TAGS.jobs);
  return row?.id ?? null;
}

/**
 * Star / unstar a job (starred jobs pin as inline tabs). Starring enforces the
 * `MAX_FAVORITES` cap atomically via a single conditional UPDATE (see the inline
 * note); the client guard in the store mirrors this for UX, but this server
 * check is authoritative. Side effect: a `board:jobs` cache revalidation.
 */
export async function setJobStarred(jobIdRaw: number, starred: boolean) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  if (starred) {
    // Enforce the favorites cap atomically: a single conditional UPDATE that
    // sets starred=true only while fewer than MAX_FAVORITES *other* jobs are
    // starred. The count subquery is evaluated within the same statement as
    // the write, so concurrent stars contend on the same rows and cannot both
    // slip past the cap — unlike a separate count-then-update, which reads a
    // stale count. The client-side guard in store.ts mirrors this UX-side; the
    // server check here is authoritative.
    await db
      .update(jobs)
      .set({ starred: true })
      .where(
        and(
          eq(jobs.id, jobId),
          sql`(select count(*) from ${jobs} where ${jobs.starred} = true and ${jobs.id} <> ${jobId}) < ${MAX_FAVORITES}`
        )
      );
  } else {
    await db.update(jobs).set({ starred: false }).where(eq(jobs.id, jobId));
  }
  revalidateTag(BOARD_TAGS.jobs);
}

/** Delete a job; its candidates and feedback cascade via the FKs. */
export async function deleteJob(jobIdRaw: number) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  await db.delete(jobs).where(eq(jobs.id, jobId));
  // Candidates (and their feedback) cascade-delete with the job, so both the
  // jobs and candidates reads are now stale.
  revalidateTag(BOARD_TAGS.jobs);
  revalidateTag(BOARD_TAGS.candidates);
}
