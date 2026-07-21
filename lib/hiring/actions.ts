'use server';

// Server actions — the single write path for the board. Each validates its
// input at runtime (zod, from ./schemas), mutates Postgres, then revalidates
// `/`. Mirrors the store's mutation surface one-to-one so the client can call
// them optimistically. A parse failure throws → the store's resync() reverts
// the optimistic change. (Board access is public per the v1 decision; to gate
// it, add a requireUser() check, mirroring requireAdmin() in app/admin/actions.ts.)

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, jobs, candidates, feedback } from '@/lib/db';
import { stageDeletable } from './helpers';
import type { Status } from './types';
import {
  zId,
  zIndex,
  zDir,
  zStatus,
  zOwner,
  zSource,
  zStageName,
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
  const name = zStageName.parse(nameRaw); // trims + non-empty
  const stages = await loadJobStages(jobId);
  if (!stages) return;
  // Stages are keyed by name — reject case-insensitive duplicates.
  if (stages.some((s) => s.toLowerCase() === name.toLowerCase())) return;
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
  const name = zStageName.parse(nameRaw);
  const stages = await loadJobStages(jobId);
  if (!stages) return;
  const old = stages[index];
  if (old === undefined || name === old) return;
  // Don't allow renaming onto another stage's name (case-insensitive).
  if (stages.some((s, i) => i !== index && s.toLowerCase() === name.toLowerCase())) {
    return;
  }
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
