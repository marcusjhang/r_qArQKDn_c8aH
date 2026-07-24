'use server';

// Job write actions (create / star / delete). See ./index for the boundary contract.

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

/** Create a new job with the default stages; returns the new id. `traits` seeds the important-traits list (empty when none), `description` is the JD. */
export async function createJob(
  titleRaw: string,
  descriptionRaw = '',
  traitsRaw?: string[]
): Promise<number | null> {
  await requireUser();
  const title = zJobTitle.parse(titleRaw);
  const description = zJobDescription.parse(descriptionRaw ?? '');
  // No traits means an empty list, not a default set.
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

/** Replace a job's important-traits list under a row lock. A single rename carries recorded feedback scores from the old key to the new (else they'd orphan), mirroring renameStage. */
export async function setJobTraits(jobIdRaw: number, traitsRaw: string[]) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const traits = zTraitList.parse(traitsRaw).map((t) => t.trim());
  await db.transaction(async (tx) => {
    const current = await lockJobTraits(tx, jobId);
    if (!current) return;
    const rename = detectTraitRename(current, traits);
    if (rename) {
      // Move the score from old key to new for this job's feedback rows, never overwriting one the new name already has. `jsonb_exists` is the function form of the `?` key-test, avoiding a `?`-placeholder clash.
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

/** Swap a trait with its neighbour (reuses `reorderStages`), under a row lock so a concurrent trait edit can't clobber it with a stale write. */
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

/** Ask the AI recommender for a few traits from a job title/description. Returns [] rather than throwing so the UI can degrade to manual entry. */
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
    // Enforce the favorites cap atomically: one conditional UPDATE whose count subquery runs in the same statement, so concurrent stars can't both slip past the cap (a count-then-update would read a stale count). Authoritative; store.ts mirrors it UX-side.
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
  await db.delete(jobs).where(eq(jobs.id, jobId));
}
