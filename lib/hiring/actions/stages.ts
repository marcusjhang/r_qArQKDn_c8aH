'use server';

// Stage-pipeline write actions (add / rename / reorder / delete). Part of the
// board's single write path — see ./index for the boundary contract. Each edit
// runs inside a transaction that row-locks the job (see `lockJobStages`) so the
// concurrent read-modify-writes of the whole `stages` array can't clobber each
// other, and each applies the same shared pure mutation the store uses.

import { and, eq, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { db, jobs, candidates } from '@/lib/db';
import { BOARD_TAGS } from '../cache';
import {
  validateStageName,
  addStageToPipeline,
  reorderStages,
  removeStage
} from '../helpers';
import { zId, zIndex, zDir } from '../schemas';
import { lockJobStages } from './support';

export async function addStage(jobIdRaw: number, nameRaw: string) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const changed = await db.transaction(async (tx) => {
    const stages = await lockJobStages(tx, jobId);
    if (!stages) return false;
    const result = addStageToPipeline(stages, nameRaw);
    if (!result.ok) return false;
    await tx.update(jobs).set({ stages: result.stages }).where(eq(jobs.id, jobId));
    return true;
  });
  if (changed) revalidateTag(BOARD_TAGS.jobs);
}

export async function renameStage(
  jobIdRaw: number,
  indexRaw: number,
  nameRaw: string
) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const index = zIndex.parse(indexRaw);
  // Lock the job row, then rename the stage and re-point its candidates in one
  // transaction. The lock serializes this against the other stage-array edits,
  // so a concurrent add/reorder can't clobber the renamed array and leave the
  // re-pointed candidates referencing a stage no longer in it.
  const changed = await db.transaction(async (tx) => {
    const stages = await lockJobStages(tx, jobId);
    if (!stages) return false;
    const old = stages[index];
    const name = nameRaw.trim();
    if (old === undefined || name === old) return false;
    if (!validateStageName(stages, nameRaw, index).ok) return false;
    const next = [...stages];
    next[index] = name;
    await tx.update(jobs).set({ stages: next }).where(eq(jobs.id, jobId));
    await tx
      .update(candidates)
      .set({ stage: name })
      .where(and(eq(candidates.jobId, jobId), eq(candidates.stage, old)));
    return true;
  });
  // The transaction renames the stage on the job and re-points every candidate
  // in the old column, so both reads are stale.
  if (changed) {
    revalidateTag(BOARD_TAGS.jobs);
    revalidateTag(BOARD_TAGS.candidates);
  }
}

export async function reorderStage(
  jobIdRaw: number,
  indexRaw: number,
  dirRaw: 1 | -1
) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const index = zIndex.parse(indexRaw);
  const dir = zDir.parse(dirRaw);
  const changed = await db.transaction(async (tx) => {
    const stages = await lockJobStages(tx, jobId);
    if (!stages) return false;
    const result = reorderStages(stages, index, dir);
    if (!result.ok) return false;
    await tx.update(jobs).set({ stages: result.stages }).where(eq(jobs.id, jobId));
    return true;
  });
  if (changed) revalidateTag(BOARD_TAGS.jobs);
}

export async function deleteStage(jobIdRaw: number, indexRaw: number) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const index = zIndex.parse(indexRaw);
  const changed = await db.transaction(async (tx) => {
    const stages = await lockJobStages(tx, jobId);
    if (!stages) return false;
    const stage = stages[index];
    if (stage === undefined) return false;
    // Count occupants under the same lock so the emptiness check and the array
    // write can't straddle a concurrent stage edit.
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(candidates)
      .where(and(eq(candidates.jobId, jobId), eq(candidates.stage, stage)));
    const result = removeStage(stages, index, Number(n) > 0);
    if (!result.ok) return false;
    // removeStage only succeeds on an empty column, so no candidate rows change.
    await tx.update(jobs).set({ stages: result.stages }).where(eq(jobs.id, jobId));
    return true;
  });
  if (changed) revalidateTag(BOARD_TAGS.jobs);
}
