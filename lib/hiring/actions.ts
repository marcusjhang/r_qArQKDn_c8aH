'use server';

// Server actions — the single write path for the board. Each validates its
// input at runtime (zod, from ./schemas), mutates Postgres, then revalidates
// `/`. Mirrors the store's mutation surface one-to-one so the client can call
// them optimistically. A parse failure throws → the store's resync() reverts
// the optimistic change. (The whole app is gated by the auth middleware, so a
// caller here is already an authenticated user.)

import { and, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, jobs, candidates, feedback } from '@/lib/db';
import { stageDeletable, validateStageName, MAX_FAVORITES } from './helpers';
import { DEFAULT_STAGES } from './config';
import type { Status } from './types';
import {
  zId,
  zIndex,
  zDir,
  zStatus,
  zOwner,
  zSource,
  zStageName,
  zJobTitle,
  candidateInsertSchema,
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
  revalidatePath('/');
  return row?.id ?? null;
}

/** Returns the new candidate's id so the client can reconcile its optimistic row. */
export async function addCandidate(
  jobIdRaw: number,
  nameRaw: string,
  sourceRaw: string,
  ownerRaw: string
): Promise<number | null> {
  const jobId = zId.parse(jobIdRaw);
  const { name, source, owner } = candidateInsertSchema.parse({
    name: nameRaw,
    source: sourceRaw,
    owner: ownerRaw
  });
  const stages = await loadJobStages(jobId);
  if (!stages) return null;
  const [row] = await db
    .insert(candidates)
    .values({ jobId, name, stage: stages[0], owner, source, status: 'active' })
    .returning({ id: candidates.id });
  revalidatePath('/');
  return row?.id ?? null;
}

export async function setJobStarred(jobIdRaw: number, starred: boolean) {
  const jobId = zId.parse(jobIdRaw);
  if (starred) {
    // Enforce the favorites cap (count other starred jobs).
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(and(eq(jobs.starred, true), ne(jobs.id, jobId)));
    if (Number(n) >= MAX_FAVORITES) return;
  }
  await db.update(jobs).set({ starred: !!starred }).where(eq(jobs.id, jobId));
  revalidatePath('/');
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
  revalidatePath('/');
}

/** Delete a job; its candidates and feedback cascade via the FKs. */
export async function deleteJob(jobIdRaw: number) {
  const jobId = zId.parse(jobIdRaw);
  await db.delete(jobs).where(eq(jobs.id, jobId));
  revalidatePath('/');
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
  let status: Status = c.status;
  if (stage === 'Hired') status = 'hired';
  else if (c.status === 'hired') status = 'active';
  await db.update(candidates).set({ stage, status }).where(eq(candidates.id, id));
  revalidatePath('/');
}

export async function setOwner(idRaw: number, ownerRaw: string) {
  const id = zId.parse(idRaw);
  const owner = zOwner.parse(ownerRaw);
  await db.update(candidates).set({ owner }).where(eq(candidates.id, id));
  revalidatePath('/');
}

export async function setSource(idRaw: number, sourceRaw: string) {
  const id = zId.parse(idRaw);
  const source = zSource.parse(sourceRaw);
  await db.update(candidates).set({ source }).where(eq(candidates.id, id));
  revalidatePath('/');
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
  let stage = c.stage;
  if (status === 'hired' && c.stage !== 'Hired') {
    const stages = await loadJobStages(c.jobId);
    if (stages?.includes('Hired')) stage = 'Hired';
  }
  await db.update(candidates).set({ status, stage }).where(eq(candidates.id, id));
  revalidatePath('/');
}

export async function addFeedback(
  idRaw: number,
  byFounderRaw: string,
  ratingRaw: number,
  noteRaw: string
) {
  const id = zId.parse(idRaw);
  const { byFounder, rating, note } = feedbackInsertSchema.parse({
    byFounder: byFounderRaw,
    rating: ratingRaw,
    note: noteRaw ?? ''
  });
  await db
    .insert(feedback)
    .values({ candidateId: id, byFounder, rating, note });
  revalidatePath('/');
}

export async function addStage(jobIdRaw: number, nameRaw: string) {
  const jobId = zId.parse(jobIdRaw);
  const stages = await loadJobStages(jobId);
  if (!stages) return;
  if (!validateStageName(stages, nameRaw).ok) return;
  const name = nameRaw.trim();
  const next = [...stages];
  next.splice(next.length - 1, 0, name); // insert before the last stage
  await db.update(jobs).set({ stages: next }).where(eq(jobs.id, jobId));
  revalidatePath('/');
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
  revalidatePath('/');
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
  const target = index + dir;
  if (target < 0 || target >= stages.length) return;
  const next = [...stages];
  [next[index], next[target]] = [next[target], next[index]];
  await db.update(jobs).set({ stages: next }).where(eq(jobs.id, jobId));
  revalidatePath('/');
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
  if (!stageDeletable(stages, Number(n) > 0).ok) return;
  const next = [...stages];
  next.splice(index, 1);
  await db.update(jobs).set({ stages: next }).where(eq(jobs.id, jobId));
  revalidatePath('/');
}
