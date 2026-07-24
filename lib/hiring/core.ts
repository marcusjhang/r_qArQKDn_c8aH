import 'server-only';

// Actor-scoped write core: the single write path for candidate & feedback mutations, shared by the web actions and the MCP tools. Takes an explicit actorUserId (never calls auth()); a missing row returns a sentinel, invalid input throws (zod).

import { eq } from 'drizzle-orm';
import { db, candidates, feedback } from '@/lib/db';
import { placeInStage, placeWithStatus, scopeTraitScores } from './helpers';
import type { Placement } from './helpers';
import type { Status } from './types';
import {
  zId,
  zStatus,
  zStageName,
  candidateInsertSchema,
  candidateEditSchema,
  feedbackInsertSchema
} from './schemas';
import { lockJobStages, withStageClock, loadJobTraits } from './actions/support';

/** Fields shared by the add- and edit-candidate cores. */
export interface CandidateWriteInput {
  name: string;
  source: number;
  /** Accountable owner (a users.id); on add defaults to the actor, on edit an omitted field keeps the current owner. */
  owner?: number | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  yearsExperience?: number | null;
}

/** Add a candidate to a job's first stage; returns the new id, or null when the job doesn't exist. */
export async function addCandidateCore(
  actorUserId: number,
  jobIdRaw: number,
  input: CandidateWriteInput
): Promise<number | null> {
  const jobId = zId.parse(jobIdRaw);
  const { name, source, owner, linkedinUrl, githubUrl, yearsExperience } =
    candidateInsertSchema.parse({
      name: input.name,
      source: input.source,
      owner: input.owner ?? actorUserId,
      linkedinUrl: input.linkedinUrl ?? null,
      githubUrl: input.githubUrl ?? null,
      yearsExperience: input.yearsExperience ?? null
    });
  // Row-lock the job so a concurrent stage edit can't strand the candidate in a stage the job no longer has.
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

/** PATCH a candidate: name/source always apply, owner/links/years change only when provided (omitted keeps current, explicit null clears). Returns false when the candidate doesn't exist. */
export async function editCandidateCore(
  _actorUserId: number,
  idRaw: number,
  input: CandidateWriteInput
): Promise<boolean> {
  const id = zId.parse(idRaw);
  // Read the current row so omitted fields keep their value (and to confirm existence).
  const [cur] = await db
    .select({
      owner: candidates.owner,
      linkedinUrl: candidates.linkedinUrl,
      githubUrl: candidates.githubUrl,
      yearsExperience: candidates.yearsExperience
    })
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  if (!cur) return false;

  const { name, source, owner, linkedinUrl, githubUrl, yearsExperience } =
    candidateEditSchema.parse({
      name: input.name,
      source: input.source,
      owner: input.owner ?? cur.owner,
      linkedinUrl:
        input.linkedinUrl === undefined ? cur.linkedinUrl : input.linkedinUrl,
      githubUrl:
        input.githubUrl === undefined ? cur.githubUrl : input.githubUrl,
      yearsExperience:
        input.yearsExperience === undefined
          ? cur.yearsExperience
          : input.yearsExperience
    });
  await db
    .update(candidates)
    .set({ name, source, owner, linkedinUrl, githubUrl, yearsExperience })
    .where(eq(candidates.id, id));
  return true;
}

/** Move a candidate into `stage` (entering the terminal stage auto-hires; see placeInStage). Returns the placement, or null when the candidate doesn't exist. */
export async function moveStageCore(
  _actorUserId: number,
  idRaw: number,
  stageRaw: string
): Promise<Placement | null> {
  const id = zId.parse(idRaw);
  const stage = zStageName.parse(stageRaw);
  // Row-lock the job so a concurrent stage edit can't strand the candidate (or flip a stale terminal to hired).
  return db.transaction(async (tx) => {
    // Project only the placement inputs (jobId, stage, status) rather than SELECT *.
    const [c] = await tx
      .select({
        jobId: candidates.jobId,
        stage: candidates.stage,
        status: candidates.status
      })
      .from(candidates)
      .where(eq(candidates.id, id))
      .limit(1);
    if (!c) return null;
    // Resolve "terminal" (last stage) under the lock so auto-hire can't race a rename.
    const stages = (await lockJobStages(tx, c.jobId)) ?? [];
    // Guard stage membership: a stray stage would strand the card off-board (or wrongly hire).
    if (!stages.includes(stage)) return null;
    const placement = placeInStage(stage, c, stages);
    // Reset the stage clock only on an actual stage change (a no-op move keeps the timer).
    await tx
      .update(candidates)
      .set(withStageClock(placement, c.stage))
      .where(eq(candidates.id, id));
    return placement;
  });
}

/** Set a candidate's status (hired pulls them into the terminal stage; see placeWithStatus). Returns the placement, or null when the candidate doesn't exist. */
export async function setStatusCore(
  _actorUserId: number,
  idRaw: number,
  statusRaw: Status
): Promise<Placement | null> {
  const id = zId.parse(idRaw);
  const status = zStatus.parse(statusRaw);
  return db.transaction(async (tx) => {
    // Same projection as moveStageCore — avoid SELECT *.
    const [c] = await tx
      .select({
        jobId: candidates.jobId,
        stage: candidates.stage,
        status: candidates.status
      })
      .from(candidates)
      .where(eq(candidates.id, id))
      .limit(1);
    if (!c) return null;
    // Only the Hired transition consults (and locks) the stage list, so a concurrent stage edit can't move the terminal out from under auto-hire.
    const stages =
      status === 'hired' ? ((await lockJobStages(tx, c.jobId)) ?? []) : [];
    const placement = placeWithStatus(status, c, stages);
    // A status change that moves the card restarts the clock; one that stays in place leaves it running.
    await tx
      .update(candidates)
      .set(withStageClock(placement, c.stage))
      .where(eq(candidates.id, id));
    return placement;
  });
}

/** Star / unstar a candidate (no favorites cap). Returns false when the candidate doesn't exist. */
export async function setCandidateStarredCore(
  _actorUserId: number,
  idRaw: number,
  starred: boolean
): Promise<boolean> {
  const id = zId.parse(idRaw);
  const updated = await db
    .update(candidates)
    .set({ starred: !!starred })
    .where(eq(candidates.id, id))
    .returning({ id: candidates.id });
  return updated.length > 0;
}

/** Upsert the actor's feedback on a candidate: per-trait 1–4 scores scoped to the job's current traits, one entry per (candidate, user). Returns the feedback id, or null when the candidate is gone / nothing scored. */
export async function addFeedbackCore(
  actorUserId: number,
  candidateIdRaw: number,
  // Untrusted raw input (sparse map, allows undefined); the zod parse below drops anything that isn't a 1–4 rating.
  traitScoresRaw: Record<string, number | undefined>,
  noteRaw: string
): Promise<number | null> {
  const candidateId = zId.parse(candidateIdRaw);
  const { byUser, traitScores, note } = feedbackInsertSchema.parse({
    byUser: actorUserId,
    traitScores: traitScoresRaw ?? {},
    note: noteRaw ?? ''
  });
  const [c] = await db
    .select({ jobId: candidates.jobId, stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);
  if (!c) return null;
  const jobTraits = (await loadJobTraits(c.jobId)) ?? [];
  // Scope scores to the job's current traits and require at least one to survive when the job tracks traits (pure rule in the helper).
  const { scoped, hasAnyScore } = scopeTraitScores(jobTraits, traitScores ?? {});
  if (jobTraits.length > 0 && !hasAnyScore) return null;
  const [row] = await db
    .insert(feedback)
    .values({ candidateId, byUser, traitScores: scoped, note, stage: c.stage })
    // One entry per (candidate, user): re-saving edits it; `stage` re-stamps to the current stage (latest round scored).
    .onConflictDoUpdate({
      target: [feedback.candidateId, feedback.byUser],
      set: { traitScores: scoped, note, stage: c.stage }
    })
    .returning({ id: feedback.id });
  return row?.id ?? null;
}
