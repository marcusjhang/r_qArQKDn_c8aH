'use server';

// Feedback write action. Part of the board's single write path — see ./index
// for the boundary contract. The author is derived server-side from the session
// (never the client), so a caller cannot attribute feedback to a colleague.

import { eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db, candidates, feedback } from '@/lib/db';
import { zId, feedbackInsertSchema } from '../schemas';
import { currentUserId, loadJobTraits } from './support';

/**
 * Save the signed-in user's feedback for a candidate. Exactly one entry per
 * (candidate, user): the first save inserts (recording the candidate's current
 * stage), later saves by the same user update the trait scores and note in
 * place — the recorded stage is preserved. Trait scores are scoped to the job's
 * current traits so a stale/renamed key can never persist. Returns the feedback
 * id so the client can reconcile its optimistic row, or null when the caller
 * can't be resolved to an account.
 */
export async function saveFeedback(
  idRaw: number,
  noteRaw: string,
  traitScoresRaw: Record<string, number> = {}
): Promise<number | null> {
  await requireUser();
  const byUser = await currentUserId();
  if (byUser == null) return null;
  const id = zId.parse(idRaw);
  const { traitScores, note } = feedbackInsertSchema.parse({
    byUser,
    traitScores: traitScoresRaw ?? {},
    note: noteRaw ?? ''
  });
  const [c] = await db
    .select({ jobId: candidates.jobId, stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);
  if (!c) return null;
  const jobTraits = (await loadJobTraits(c.jobId)) ?? [];
  const allowed = new Set(jobTraits);
  const scoped = Object.fromEntries(
    Object.entries(traitScores ?? {}).filter(([trait]) => allowed.has(trait))
  );
  // Server-side mirror of the form's "score at least one trait" rule: when the
  // job tracks traits, a feedback entry must score at least one of them. Guards
  // the action against a direct/racey call the client check can't cover.
  if (jobTraits.length > 0 && Object.keys(scoped).length === 0) return null;
  const [row] = await db
    .insert(feedback)
    .values({
      candidateId: id,
      byUser,
      traitScores: scoped,
      note,
      stage: c.stage
    })
    // One entry per (candidate, user): re-saving edits it. `stage` is not in
    // the update set, so it keeps the stage it was first created at.
    .onConflictDoUpdate({
      target: [feedback.candidateId, feedback.byUser],
      set: { traitScores: scoped, note }
    })
    .returning({ id: feedback.id });
  return row?.id ?? null;
}
