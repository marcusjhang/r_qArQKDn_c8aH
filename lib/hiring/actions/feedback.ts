'use server';

// Feedback write action: a thin wrapper over addFeedbackCore. The author is derived server-side from the session (currentUserId), never the client, so a caller can't attribute feedback to a colleague.

import { requireUser } from '@/lib/auth';
import { addFeedbackCore } from '../core';
import { currentUserId } from './support';

/** Save the signed-in user's feedback (one entry per candidate+user, upserted; scores scoped to the job's current traits). Returns the id, or null when the caller can't be resolved to an account. */
export async function saveFeedback(
  idRaw: number,
  noteRaw: string,
  // Sparse map from the client (keys only for scored traits); re-validated in addFeedbackCore.
  traitScoresRaw: Record<string, number | undefined> = {}
): Promise<number | null> {
  await requireUser();
  const byUser = await currentUserId();
  if (byUser == null) return null;
  return addFeedbackCore(byUser, idRaw, traitScoresRaw, noteRaw);
}
