'use server';

// Job write actions (create / star / delete). Part of the board's single write
// path — see ./index for the boundary contract (zod-validate → mutate → store
// rollback on throw) shared by every action module.

import { and, eq, inArray, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db, jobs, candidates, feedback } from '@/lib/db';
import { MAX_FAVORITES, reorderStages, detectTraitRename } from '../helpers';
import { DEFAULT_STAGES } from '../config';
import {
  zId,
  zIndex,
  zDir,
  zJobTitle,
  zJobDescription,
  zTraitList
} from '../schemas';
import { suggestTraits } from '../ai';
import { lockJobTraits } from './support';

/**
 * Create a new job with the compulsory default stages. Returns the new id so
 * the client can reconcile its optimistic job and switch the board to it.
 * `traits` seeds the job's important-traits list; a job created with none
 * simply starts empty and traits are added later. `description` is the JD.
 */
export async function createJob(
  titleRaw: string,
  descriptionRaw = '',
  traitsRaw?: string[]
): Promise<number | null> {
  await requireUser();
  const title = zJobTitle.parse(titleRaw);
  const description = zJobDescription.parse(descriptionRaw ?? '');
  // Use the caller's chosen traits (e.g. AI suggestions accepted at creation);
  // no traits means the job starts with an empty list, not a default set.
  const traits = traitsRaw?.length
    ? zTraitList.parse(traitsRaw).map((t) => t.trim())
    : [];
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
 * Replace a job's important-traits list (add/remove/reorder/rename). Validated
 * (capped, unique) then written under a row lock so a concurrent trait edit
 * can't clobber it.
 *
 * When the change is a single *rename* (one label swapped for another), the
 * recorded feedback scores keyed by the old name are carried over to the new
 * name in the same transaction — otherwise a founder fixing a typo would
 * silently orphan every score under the old key. This mirrors how `renameStage`
 * re-points the candidates sitting in a renamed stage.
 */
export async function setJobTraits(jobIdRaw: number, traitsRaw: string[]) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const traits = zTraitList.parse(traitsRaw).map((t) => t.trim());
  await db.transaction(async (tx) => {
    const current = await lockJobTraits(tx, jobId);
    if (!current) return;
    const rename = detectTraitRename(current, traits);
    if (rename) {
      // Move the score stored under the old key to the new key for every
      // feedback row on this job's candidates — but never overwrite a score the
      // new name already has (the existing value wins). `jsonb_exists` is the
      // function form of the `?` key-test, avoiding any `?`-placeholder clash.
      await tx
        .update(feedback)
        .set({
          traitScores: sql`(${feedback.traitScores} - ${rename.from}) || jsonb_build_object(${rename.to}::text, ${feedback.traitScores} -> ${rename.from})`
        })
        .where(
          and(
            inArray(
              feedback.candidateId,
              tx
                .select({ id: candidates.id })
                .from(candidates)
                .where(eq(candidates.jobId, jobId))
            ),
            sql`jsonb_exists(${feedback.traitScores}, ${rename.from})`,
            sql`not jsonb_exists(${feedback.traitScores}, ${rename.to})`
          )
        );
    }
    await tx.update(jobs).set({ traits }).where(eq(jobs.id, jobId));
  });
}

/**
 * Swap a trait with its neighbour to re-rank it. Reuses the shared
 * `reorderStages` ordered-list helper — traits are just another ordered
 * string[], so the swap+bounds rule is identical. Runs inside a transaction that
 * row-locks the job (see `lockJobTraits`) so a concurrent trait edit can't read
 * the same array and clobber this reorder with a stale write.
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
  await db.transaction(async (tx) => {
    const traits = await lockJobTraits(tx, jobId);
    if (!traits) return;
    const result = reorderStages(traits, index, dir);
    if (!result.ok) return;
    await tx.update(jobs).set({ traits: result.stages }).where(eq(jobs.id, jobId));
  });
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
