'use server';

// Feedback write action. Part of the board's single write path — see ./index
// for the boundary contract. The author is derived server-side from the session
// (never the client), so a caller cannot attribute feedback to a colleague.

import { requireUser } from '@/lib/auth';
import { db, feedback } from '@/lib/db';
import { zId, feedbackInsertSchema } from '../schemas';
import { currentUserId } from './support';

/**
 * Add a feedback entry to a candidate. Returns the new feedback id so the
 * client can reconcile its optimistic row, or null when the caller can't be
 * resolved to an account.
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
  return row?.id ?? null;
}
