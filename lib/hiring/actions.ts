'use server';

// Server actions — the single write path for the board. Each validates its
// input at runtime (zod, from ./schemas), mutates Postgres, then revalidates
// only the cache tag(s) whose rows it changed — `board:jobs`, `board:candidates`,
// or both (see ./cache and the tagged reads in ./queries). Because these actions
// are the board's sole write path, per-tag invalidation keeps the Data Cache
// consistent without a cache-wide `revalidatePath('/')`. Mirrors the store's
// mutation surface one-to-one so the client can call them optimistically. A
// parse failure throws → the store's resync() reverts the optimistic change.
// (The whole app is gated by the auth middleware, so a caller here is already
// an authenticated user.)

import { and, eq, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, jobs, candidates, feedback } from '@/lib/db';
import { BOARD_TAGS } from './cache';
import {
  validateStageName,
  addStageToPipeline,
  reorderStages,
  removeStage,
  placeInStage,
  placeWithStatus,
  MAX_FAVORITES
} from './helpers';
import { DEFAULT_STAGES } from './config';
import type { Status } from './types';
import {
  zId,
  zIndex,
  zDir,
  zStatus,
  zStageName,
  zJobTitle,
  candidateInsertSchema,
  candidateEditSchema,
  feedbackInsertSchema
} from './schemas';

async function loadJobStages(jobId: number): Promise<string[] | null> {
  const [j] = await db
    .select({ stages: jobs.stages })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return j?.stages ?? null;
}

/**
 * Create a new job with the compulsory default stages. Returns the new id so
 * the client can reconcile its optimistic job and switch the board to it.
 */
export async function createJob(titleRaw: string): Promise<number | null> {
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

/** Returns the new candidate's id so the client can reconcile its optimistic row. */
export async function addCandidate(
  jobIdRaw: number,
  nameRaw: string,
  sourceRaw: number,
  ownerRaw: number,
  linkedinUrlRaw: string | null = null,
  githubUrlRaw: string | null = null,
  yearsExperienceRaw: number | null = null
): Promise<number | null> {
  const jobId = zId.parse(jobIdRaw);
  const { name, source, owner, linkedinUrl, githubUrl, yearsExperience } =
    candidateInsertSchema.parse({
      name: nameRaw,
      source: sourceRaw,
      owner: ownerRaw,
      linkedinUrl: linkedinUrlRaw,
      githubUrl: githubUrlRaw,
      yearsExperience: yearsExperienceRaw
    });
  const stages = await loadJobStages(jobId);
  if (!stages) return null;
  const [row] = await db
    .insert(candidates)
    .values({
      jobId,
      name,
      stage: stages[0],
      owner,
      source,
      linkedinUrl,
      githubUrl,
      yearsExperience,
      status: 'active'
    })
    .returning({ id: candidates.id });
  revalidateTag(BOARD_TAGS.candidates);
  return row?.id ?? null;
}

/**
 * Edit a candidate's core details: name, source, owner, the profile links, and
 * years of experience (which drives the seniority band).
 */
export async function editCandidate(
  idRaw: number,
  nameRaw: string,
  sourceRaw: number,
  ownerRaw: number,
  linkedinUrlRaw: string | null,
  githubUrlRaw: string | null,
  yearsExperienceRaw: number | null
) {
  const id = zId.parse(idRaw);
  const { name, source, owner, linkedinUrl, githubUrl, yearsExperience } =
    candidateEditSchema.parse({
      name: nameRaw,
      source: sourceRaw,
      owner: ownerRaw,
      linkedinUrl: linkedinUrlRaw,
      githubUrl: githubUrlRaw,
      yearsExperience: yearsExperienceRaw
    });
  await db
    .update(candidates)
    .set({ name, source, owner, linkedinUrl, githubUrl, yearsExperience })
    .where(eq(candidates.id, id));
  revalidateTag(BOARD_TAGS.candidates);
}

export async function setJobStarred(jobIdRaw: number, starred: boolean) {
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

/**
 * Star / unstar a candidate. A purely visual highlight (starred candidates
 * float to the top of their column), so there's no favorites cap like jobs.
 */
export async function setCandidateStarred(idRaw: number, starred: boolean) {
  const id = zId.parse(idRaw);
  await db
    .update(candidates)
    .set({ starred: !!starred })
    .where(eq(candidates.id, id));
  revalidateTag(BOARD_TAGS.candidates);
}

/** Delete a job; its candidates and feedback cascade via the FKs. */
export async function deleteJob(jobIdRaw: number) {
  const jobId = zId.parse(jobIdRaw);
  await db.delete(jobs).where(eq(jobs.id, jobId));
  // Candidates (and their feedback) cascade-delete with the job, so both the
  // jobs and candidates reads are now stale.
  revalidateTag(BOARD_TAGS.jobs);
  revalidateTag(BOARD_TAGS.candidates);
}

export async function moveStage(idRaw: number, stageRaw: string) {
  const id = zId.parse(idRaw);
  const stage = zStageName.parse(stageRaw);
  const [c] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  if (!c) return;
  const placement = placeInStage(stage, c);
  await db.update(candidates).set(placement).where(eq(candidates.id, id));
  revalidateTag(BOARD_TAGS.candidates);
}

export async function setStatus(idRaw: number, statusRaw: Status) {
  const id = zId.parse(idRaw);
  const status = zStatus.parse(statusRaw);
  const [c] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  if (!c) return;
  // Setting status to Hired moves the card into the Hired stage if one exists.
  const stages = status === 'hired' ? await loadJobStages(c.jobId) : null;
  const placement = placeWithStatus(status, c, stages ?? []);
  await db.update(candidates).set(placement).where(eq(candidates.id, id));
  revalidateTag(BOARD_TAGS.candidates);
}

export async function addFeedback(
  idRaw: number,
  byUserRaw: number,
  ratingRaw: number,
  noteRaw: string
) {
  const id = zId.parse(idRaw);
  const { byUser, rating, note } = feedbackInsertSchema.parse({
    byUser: byUserRaw,
    rating: ratingRaw,
    note: noteRaw ?? ''
  });
  await db
    .insert(feedback)
    .values({ candidateId: id, byUser, rating, note });
  // Feedback is nested inside the candidates read, so invalidate that tag.
  revalidateTag(BOARD_TAGS.candidates);
}

export async function addStage(jobIdRaw: number, nameRaw: string) {
  const jobId = zId.parse(jobIdRaw);
  const stages = await loadJobStages(jobId);
  if (!stages) return;
  const result = addStageToPipeline(stages, nameRaw);
  if (!result.ok) return;
  await db
    .update(jobs)
    .set({ stages: result.stages })
    .where(eq(jobs.id, jobId));
  revalidateTag(BOARD_TAGS.jobs);
}

export async function renameStage(
  jobIdRaw: number,
  indexRaw: number,
  nameRaw: string
) {
  const jobId = zId.parse(jobIdRaw);
  const index = zIndex.parse(indexRaw);
  const stages = await loadJobStages(jobId);
  if (!stages) return;
  const old = stages[index];
  const name = nameRaw.trim();
  if (old === undefined || name === old) return;
  if (!validateStageName(stages, nameRaw, index).ok) return;
  const next = [...stages];
  next[index] = name;
  // Re-point candidates in the renamed column, atomically with the array update.
  await db.transaction(async (tx) => {
    await tx.update(jobs).set({ stages: next }).where(eq(jobs.id, jobId));
    await tx
      .update(candidates)
      .set({ stage: name })
      .where(and(eq(candidates.jobId, jobId), eq(candidates.stage, old)));
  });
  // The transaction renames the stage on the job and re-points every candidate
  // in the old column, so both reads are stale.
  revalidateTag(BOARD_TAGS.jobs);
  revalidateTag(BOARD_TAGS.candidates);
}

export async function reorderStage(
  jobIdRaw: number,
  indexRaw: number,
  dirRaw: 1 | -1
) {
  const jobId = zId.parse(jobIdRaw);
  const index = zIndex.parse(indexRaw);
  const dir = zDir.parse(dirRaw);
  const stages = await loadJobStages(jobId);
  if (!stages) return;
  const result = reorderStages(stages, index, dir);
  if (!result.ok) return;
  await db
    .update(jobs)
    .set({ stages: result.stages })
    .where(eq(jobs.id, jobId));
  revalidateTag(BOARD_TAGS.jobs);
}

export async function deleteStage(jobIdRaw: number, indexRaw: number) {
  const jobId = zId.parse(jobIdRaw);
  const index = zIndex.parse(indexRaw);
  const stages = await loadJobStages(jobId);
  if (!stages) return;
  const stage = stages[index];
  if (stage === undefined) return;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(candidates)
    .where(and(eq(candidates.jobId, jobId), eq(candidates.stage, stage)));
  const result = removeStage(stages, index, Number(n) > 0);
  if (!result.ok) return;
  // removeStage only succeeds on an empty column, so no candidate rows change.
  await db
    .update(jobs)
    .set({ stages: result.stages })
    .where(eq(jobs.id, jobId));
  revalidateTag(BOARD_TAGS.jobs);
}
