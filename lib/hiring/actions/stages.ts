'use server';

// Stage-pipeline write actions (add / rename / reorder / delete). Part of the
// board's single write path — see ./index for the boundary contract. Each edit
// runs inside a transaction that row-locks the job (see `lockJobStages`) so the
// concurrent read-modify-writes of the whole `stages` array can't clobber each
// other, and each applies the same shared pure mutation the store uses.

import { and, eq, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db, jobs, candidates } from '@/lib/db';
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
  await db.transaction(async (tx) => {
    const stages = await lockJobStages(tx, jobId);
    if (!stages) return;
    const result = addStageToPipeline(stages, nameRaw);
    if (!result.ok) return;
    await tx.update(jobs).set({ stages: result.stages }).where(eq(jobs.id, jobId));
  });
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
  await db.transaction(async (tx) => {
    const stages = await lockJobStages(tx, jobId);
    if (!stages) return;
    const old = stages[index];
    const name = nameRaw.trim();
    if (old === undefined || name === old) return;
    if (!validateStageName(stages, nameRaw, index).ok) return;
    const next = [...stages];
    next[index] = name;
    await tx.update(jobs).set({ stages: next }).where(eq(jobs.id, jobId));
    await tx
      .update(candidates)
      .set({ stage: name })
      .where(and(eq(candidates.jobId, jobId), eq(candidates.stage, old)));
  });
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
  await db.transaction(async (tx) => {
    const stages = await lockJobStages(tx, jobId);
    if (!stages) return;
    const result = reorderStages(stages, index, dir);
    if (!result.ok) return;
    await tx.update(jobs).set({ stages: result.stages }).where(eq(jobs.id, jobId));
  });
}

export async function deleteStage(jobIdRaw: number, indexRaw: number) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  const index = zIndex.parse(indexRaw);
  await db.transaction(async (tx) => {
    const stages = await lockJobStages(tx, jobId);
    if (!stages) return;
    const stage = stages[index];
    if (stage === undefined) return;
    // Count occupants under the same lock so the emptiness check and the array
    // write can't straddle a concurrent stage edit.
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(candidates)
      .where(and(eq(candidates.jobId, jobId), eq(candidates.stage, stage)));
    const result = removeStage(stages, index, Number(n) > 0);
    if (!result.ok) return;
    // removeStage only succeeds on an empty column, so no candidate rows change.
    await tx.update(jobs).set({ stages: result.stages }).where(eq(jobs.id, jobId));
  });
}
