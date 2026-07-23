import 'server-only';

// Actor-scoped write core — the single write path for candidate & feedback
// mutations, shared by two front doors:
//
//   1. the web `'use server'` actions (lib/hiring/actions/**), which resolve the
//      caller from the next-auth session;
//   2. the MCP tools (app/api/mcp/route.ts), which resolve the caller from a
//      bearer token.
//
// Each function takes an explicit `actorUserId` (the user the write acts as),
// does zod-parse → guard → Drizzle write, and returns a small result the caller
// can use for its own concerns. It deliberately does NOT call `auth()` — auth
// resolution belongs to the front doors, so the two paths can never drift on the
// write itself. Nothing revalidates a server cache: the board is uncached and
// TanStack Query is the client's only cache, so a write just persists to
// Postgres and the next board fetch reflects it.
//
// Convention for "the thing you named doesn't exist": these functions return a
// sentinel (`null` / `false`) rather than throwing, mirroring the web actions'
// existing silent no-op on a missing row. Invalid *input* still throws (zod), so
// the web store's resync reverts the optimistic change and the MCP layer can map
// the failure to a structured tool error (see lib/mcp/tools.ts).

import { eq } from 'drizzle-orm';
import { db, candidates, feedback, jobs } from '@/lib/db';
import { placeInStage, placeWithStatus } from './helpers';
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

async function loadJobStages(jobId: number): Promise<string[] | null> {
  const [j] = await db
    .select({ stages: jobs.stages })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return j?.stages ?? null;
}

/** Fields shared by the add- and edit-candidate cores. */
export interface CandidateWriteInput {
  name: string;
  source: number;
  /**
   * Accountable owner (a users.id). On add, defaults to the actor when omitted;
   * on edit, an omitted field keeps the candidate's current owner.
   */
  owner?: number | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  yearsExperience?: number | null;
}

/**
 * Add a candidate to a job's first stage, acting as `actorUserId`. The owner
 * defaults to the actor when the caller doesn't name one. Returns the new
 * candidate id, or null when the job doesn't exist.
 */
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
  // Read the job's stages and insert into the first one inside a single
  // transaction that row-locks the job (the same lock the stage mutations take),
  // so a concurrent rename/reorder/delete of the first stage can't slip between
  // the read and the insert and strand the candidate in a stage the job no
  // longer has.
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
 * Edit a candidate's core details. This is a PATCH: `name` and `source` are
 * always supplied, but `owner`, the profile links, and years-of-experience only
 * change when the caller actually provides them. An omitted field (`undefined`)
 * keeps the candidate's current value — so a partial edit never silently
 * reassigns `owner` to the caller (it's notNull) or wipes a link/years to null.
 * Passing an explicit `null` for a link or years still clears it. (The web edit
 * form submits every field, so it stays a full replace; only a partial MCP edit
 * relies on the keep-on-omit behaviour.) Returns false when the candidate
 * doesn't exist.
 */
export async function editCandidateCore(
  _actorUserId: number,
  idRaw: number,
  input: CandidateWriteInput
): Promise<boolean> {
  const id = zId.parse(idRaw);
  // Read the current row so any omitted field keeps its existing value — and to
  // confirm the candidate exists before writing.
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

/**
 * Move a candidate into `stage`. Entering the terminal stage marks them hired;
 * leaving it clears a stale hired status (see `placeInStage`). Returns the
 * resulting placement, or null when the candidate doesn't exist.
 */
export async function moveStageCore(
  _actorUserId: number,
  idRaw: number,
  stageRaw: string
): Promise<Placement | null> {
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
  if (!c) return null;
  // Resolve "terminal" structurally (last stage), so auto-hire survives a rename.
  const stages = (await loadJobStages(c.jobId)) ?? [];
  // Guard stage membership: a stray stage would strand the card in a column no
  // board renders, and a stray terminal stage would wrongly flip to hired.
  if (!stages.includes(stage)) return null;
  const placement = placeInStage(stage, c, stages);
  // Reset the stage clock only on an actual stage change, so re-dropping a card
  // in its own column (or a no-op move) doesn't restart the overdue timer.
  await db
    .update(candidates)
    .set(withStageClock(placement, c.stage))
    .where(eq(candidates.id, id));
  return placement;
}

/**
 * Set a candidate's status. Becoming hired pulls them into the terminal stage
 * when one exists (see `placeWithStatus`). Returns the resulting placement, or
 * null when the candidate doesn't exist.
 */
export async function setStatusCore(
  _actorUserId: number,
  idRaw: number,
  statusRaw: Status
): Promise<Placement | null> {
  const id = zId.parse(idRaw);
  const status = zStatus.parse(statusRaw);
  // Same projection as moveStageCore: placeWithStatus only needs the current
  // stage (and jobId to load the stage list), so avoid a SELECT * of the row.
  const [c] = await db
    .select({
      jobId: candidates.jobId,
      stage: candidates.stage,
      status: candidates.status
    })
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  if (!c) return null;
  // Setting status to Hired moves the card into the Hired stage if one exists.
  const stages = status === 'hired' ? await loadJobStages(c.jobId) : null;
  const placement = placeWithStatus(status, c, stages ?? []);
  // A status change that also moves the card (to the terminal stage) restarts
  // the clock; a status change that stays in place leaves it running.
  await db
    .update(candidates)
    .set(withStageClock(placement, c.stage))
    .where(eq(candidates.id, id));
  return placement;
}

/**
 * Star / unstar a candidate (a purely visual highlight — no favorites cap).
 * Returns false when the candidate doesn't exist.
 */
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

/**
 * Leave feedback on a candidate, attributed to `actorUserId` (the token's / the
 * session's user — a token can't leave feedback as someone else). Feedback is
 * per-trait scores (1–4) keyed by the job's trait name; the scores are scoped to
 * the job's current traits so a stale/renamed key can never persist, and when
 * the job tracks traits at least one must be scored. Exactly one entry per
 * (candidate, user): the first save inserts (recording the candidate's current
 * stage), later saves by the same user update the scores/note in place. Returns
 * the feedback id, or null when the candidate doesn't exist / nothing scored.
 */
export async function addFeedbackCore(
  actorUserId: number,
  candidateIdRaw: number,
  // Untrusted raw input, re-validated by feedbackInsertSchema below. Values may
  // be absent (the web path passes a sparse TraitScores map), so the value type
  // allows `undefined`; the zod parse drops anything that isn't a 1–4 rating.
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
  const allowed = new Set(jobTraits);
  const scoped = Object.fromEntries(
    Object.entries(traitScores ?? {}).filter(([trait]) => allowed.has(trait))
  );
  if (jobTraits.length > 0 && Object.keys(scoped).length === 0) return null;
  const [row] = await db
    .insert(feedback)
    .values({ candidateId, byUser, traitScores: scoped, note, stage: c.stage })
    // One entry per (candidate, user): re-saving edits it. `stage` is not in the
    // update set, so it keeps the stage it was first created at.
    .onConflictDoUpdate({
      target: [feedback.candidateId, feedback.byUser],
      set: { traitScores: scoped, note }
    })
    .returning({ id: feedback.id });
  return row?.id ?? null;
}
