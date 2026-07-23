'use server';

// Job write actions (create / star / delete). Part of the board's single write
// path — see ./index for the boundary contract (zod-validate → mutate → store
// rollback on throw) shared by every action module.

import { and, eq, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db, jobs } from '@/lib/db';
import { MAX_FAVORITES, reorderStages } from '../helpers';
import { DEFAULT_STAGES, DEFAULT_TRAITS } from '../config';
import {
  zId,
  zIndex,
  zDir,
  zJobTitle,
  zJobDescription,
  zTraitList
} from '../schemas';
import { suggestTraits } from '../ai';
import { loadJobTraits } from './support';

/**
 * Create a new job with the compulsory default stages. Returns the new id so
 * the client can reconcile its optimistic job and switch the board to it.
 * `traits` seeds the job's important-traits list (empty → the defaults) and
 * `description` the pasteable JD.
 */
export async function createJob(
  titleRaw: string,
  descriptionRaw = '',
  traitsRaw?: string[]
): Promise<number | null> {
  await requireUser();
  const title = zJobTitle.parse(titleRaw);
  const description = zJobDescription.parse(descriptionRaw ?? '');
  // Use the caller's chosen traits (e.g. AI suggestions accepted at creation)
  // when provided and non-empty; otherwise fall back to the defaults.
  const traits =
    traitsRaw && traitsRaw.length
      ? zTraitList.parse(traitsRaw).map((t) => t.trim())
      : [...DEFAULT_TRAITS];
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${jobs.position}), -1)` })
    .from(jobs);
  const [row] = await db
    .insert(jobs)
    .values({
      title,
      stages: [...DEFAULT_STAGES],
      traits,
      description,
      position: Number(maxPos) + 1
    })
    .returning({ id: jobs.id });
  return row?.id ?? null;
}

/** Update a job's free-text description (JD). */
export async function setJobDescription(
  jobIdRaw: number,
  descriptionRaw: string
) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const description = zJobDescription.parse(descriptionRaw ?? '');
  await db.update(jobs).set({ description }).where(eq(jobs.id, jobId));
}

/**
 * Replace a job's important-traits list (add/remove/reorder). Validated
 * (capped, unique) then written in one update. Historical feedback keeps any
 * scores it recorded; the UI only surfaces scores for traits still on the job.
 */
export async function setJobTraits(jobIdRaw: number, traitsRaw: string[]) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const traits = zTraitList.parse(traitsRaw).map((t) => t.trim());
  await db.update(jobs).set({ traits }).where(eq(jobs.id, jobId));
}

/**
 * Swap a trait with its neighbour to re-rank it. Reuses the shared
 * `reorderStages` ordered-list helper — traits are just another ordered
 * string[], so the swap+bounds rule is identical.
 */
export async function reorderTrait(
  jobIdRaw: number,
  indexRaw: number,
  dirRaw: 1 | -1
) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const index = zIndex.parse(indexRaw);
  const dir = zDir.parse(dirRaw);
  const traits = await loadJobTraits(jobId);
  if (!traits) return;
  const result = reorderStages(traits, index, dir);
  if (!result.ok) return;
  await db
    .update(jobs)
    .set({ traits: result.stages })
    .where(eq(jobs.id, jobId));
}

/**
 * Ask the AI recommender for a focused few traits from a job title and
 * description. Read-only (no DB writes, no cache change); returns [] rather
 * than throwing on a backend error so the UI can degrade to manual entry.
 */
export async function recommendTraits(
  titleRaw: string,
  descriptionRaw: string
): Promise<string[]> {
  await requireUser();
  try {
    const title = zJobTitle.parse(titleRaw);
    const description = zJobDescription.parse(descriptionRaw ?? '');
    return await suggestTraits(title, description);
  } catch {
    return [];
  }
}

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
}

/** Delete a job; its candidates and feedback cascade via the FKs. */
export async function deleteJob(jobIdRaw: number) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  // Candidates (and their feedback) cascade-delete with the job via the FKs.
  await db.delete(jobs).where(eq(jobs.id, jobId));
}
