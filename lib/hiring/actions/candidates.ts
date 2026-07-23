'use server';

// Candidate write actions (add / edit / star / move stage / set status). Part
// of the board's single write path — see ./index for the boundary contract.
// The stage/status writes go through the shared pure placement helpers so the
// optimistic store and the server compute the same coupled (stage, status).

import { eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db, candidates } from '@/lib/db';
import { placeInStage, placeWithStatus } from '../helpers';
import type { Status } from '../types';
import {
  zId,
  zStatus,
  zStageName,
  candidateInsertSchema,
  candidateEditSchema
} from '../schemas';
import { loadJobStages, lockJobStages, withStageClock } from './support';

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
  await requireUser();
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
  // Read the job's stages and insert the candidate into the first one inside a
  // single transaction that row-locks the job (same lock the stage mutations
  // take). Without this, a concurrent rename/reorder/delete of the first stage
  // could slip between an unlocked read and the insert, stranding the new
  // candidate in a column the job no longer has.
  return db.transaction(async (tx) => {
    const stages = await lockJobStages(tx, jobId);
    if (!stages) return null;
    const [row] = await tx
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
    return row?.id ?? null;
  });
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
  await requireUser();
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
}

/**
 * Star / unstar a candidate. A purely visual highlight (starred candidates
 * float to the top of their column), so there's no favorites cap like jobs.
 */
export async function setCandidateStarred(idRaw: number, starred: boolean) {
  await requireUser();
  const id = zId.parse(idRaw);
  await db
    .update(candidates)
    .set({ starred: !!starred })
    .where(eq(candidates.id, id));
}

export async function moveStage(idRaw: number, stageRaw: string) {
  await requireUser();
  const id = zId.parse(idRaw);
  const stage = zStageName.parse(stageRaw);
  // Only the placement inputs are read — jobId (to load the stage list) and the
  // current stage/status that placeInStage keys off — so project to those three
  // columns instead of a SELECT * of the whole candidate row.
  const [c] = await db
    .select({
      jobId: candidates.jobId,
      stage: candidates.stage,
      status: candidates.status
    })
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  if (!c) return;
  // Resolve "terminal" structurally (last stage), so auto-hire survives a rename.
  const stages = (await loadJobStages(c.jobId)) ?? [];
  // Guard stage membership: the client only ever moves a card into one of its
  // job's stages, but this action is the sole write path and can't trust that.
  // Without the check a stray stage would strand the card in a non-existent
  // column (no board column renders it), and a stray terminal stage would
  // wrongly flip the status to hired (see placeInStage).
  if (!stages.includes(stage)) return;
  const placement = placeInStage(stage, c, stages);
  // Reset the stage clock only on an actual stage change, so re-dropping a card
  // in its own column (or a no-op move) doesn't restart the overdue timer.
  await db
    .update(candidates)
    .set(withStageClock(placement, c.stage))
    .where(eq(candidates.id, id));
}

export async function setStatus(idRaw: number, statusRaw: Status) {
  await requireUser();
  const id = zId.parse(idRaw);
  const status = zStatus.parse(statusRaw);
  // Same projection as moveStage: placeWithStatus only needs the current stage
  // (and jobId to load the stage list), so avoid a SELECT * of the row.
  const [c] = await db
    .select({
      jobId: candidates.jobId,
      stage: candidates.stage,
      status: candidates.status
    })
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  if (!c) return;
  // Setting status to Hired moves the card into the Hired stage if one exists.
  const stages = status === 'hired' ? await loadJobStages(c.jobId) : null;
  const placement = placeWithStatus(status, c, stages ?? []);
  // A status change that also moves the card (to the terminal stage) restarts
  // the clock; a status change that stays in place leaves it running.
  await db
    .update(candidates)
    .set(withStageClock(placement, c.stage))
    .where(eq(candidates.id, id));
}
