'use server';

// Server actions — the single write path for the board. Each validates its
// input at runtime (zod, from ./schemas), mutates Postgres, then revalidates
// only the cache tag(s) whose rows it changed — `board:jobs`, `board:candidates`,
// or both (see ./cache and the tagged reads in ./queries). Because these actions
// are the board's sole write path, per-tag invalidation keeps the Data Cache
// consistent without a cache-wide `revalidatePath('/')`. Mirrors the store's
// mutation surface one-to-one so the client can call them optimistically. A
// parse failure throws → the store's resync() reverts the optimistic change.
//
// The middleware only gates *page* routes; Server Actions dispatch by action id
// and can be POSTed to the public /login route, so the page gate never protects
// them. Every action therefore calls requireUser() first, which throws (→ store
// rollback) when the caller is not signed in.

import { and, eq, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { auth, requireUser } from '@/lib/auth';
import { db, jobs, candidates, feedback, users } from '@/lib/db';
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

/**
 * Resolve the signed-in caller's numeric id from their session email against
 * the live `users` table — the author of a write is derived here, never taken
 * from client input. Mirrors chat-actions/chat-logic: resolving by email (the
 * stable login identity) rather than trusting a JWT-captured id keeps a reseed
 * that renumbers the rows from attributing feedback to the wrong account, and
 * keeps a caller from fabricating feedback authored by a colleague.
 */
async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return u?.id ?? null;
}

async function loadJobStages(jobId: number): Promise<string[] | null> {
  const [j] = await db
    .select({ stages: jobs.stages })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return j?.stages ?? null;
}

// The transaction handle Drizzle passes to `db.transaction(cb)`, derived so we
// don't have to import the ORM's transaction types.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Read a job's stages inside a transaction with `SELECT … FOR UPDATE`, taking a
 * row lock so a concurrent stage edit blocks until this transaction commits.
 * The stage mutations below (add/rename/reorder/delete) all read-modify-write
 * the whole `stages` array, so without this lock two concurrent edits both read
 * the same array and the second write silently clobbers the first — and a stale
 * write can drop a stage a rename just re-pointed candidates into, orphaning
 * them. Locking the job row serializes those edits per job.
 */
async function lockJobStages(tx: Tx, jobId: number): Promise<string[] | null> {
  const [j] = await tx
    .select({ stages: jobs.stages })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .for('update')
    .limit(1);
  return j?.stages ?? null;
}

/**
 * Create a new job with the compulsory default stages. Returns the new id so
 * the client can reconcile its optimistic job and switch the board to it.
 */
export async function createJob(titleRaw: string): Promise<number | null> {
  await requireUser();
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
  revalidateTag(BOARD_TAGS.candidates);
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
  revalidateTag(BOARD_TAGS.jobs);
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
  revalidateTag(BOARD_TAGS.candidates);
}

/** Delete a job; its candidates and feedback cascade via the FKs. */
export async function deleteJob(jobIdRaw: number) {
  await requireUser();
  const jobId = zId.parse(jobIdRaw);
  await db.delete(jobs).where(eq(jobs.id, jobId));
  // Candidates (and their feedback) cascade-delete with the job, so both the
  // jobs and candidates reads are now stale.
  revalidateTag(BOARD_TAGS.jobs);
  revalidateTag(BOARD_TAGS.candidates);
}

export async function moveStage(idRaw: number, stageRaw: string) {
  await requireUser();
  const id = zId.parse(idRaw);
  const stage = zStageName.parse(stageRaw);
  const [c] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  if (!c) return;
  // Resolve "terminal" structurally (last stage), so auto-hire survives a rename.
  const stages = (await loadJobStages(c.jobId)) ?? [];
  const placement = placeInStage(stage, c, stages);
  await db.update(candidates).set(placement).where(eq(candidates.id, id));
  revalidateTag(BOARD_TAGS.candidates);
}

export async function setStatus(idRaw: number, statusRaw: Status) {
  await requireUser();
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

/**
 * Add a feedback entry to a candidate. The author is derived server-side from
 * the session (never the client), so a caller cannot attribute feedback to a
 * colleague. Returns the new feedback id so the client can reconcile its
 * optimistic row, or null when the caller can't be resolved to an account.
 */
export async function addFeedback(
  idRaw: number,
  ratingRaw: number,
  noteRaw: string
): Promise<number | null> {
  await requireUser();
  const byUser = await currentUserId();
  if (byUser == null) return null;
  const id = zId.parse(idRaw);
  const { rating, note } = feedbackInsertSchema.parse({
    byUser,
    rating: ratingRaw,
    note: noteRaw ?? ''
  });
  const [row] = await db
    .insert(feedback)
    .values({ candidateId: id, byUser, rating, note })
    .returning({ id: feedback.id });
  // Feedback is nested inside the candidates read, so invalidate that tag.
  revalidateTag(BOARD_TAGS.candidates);
  return row?.id ?? null;
}

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
