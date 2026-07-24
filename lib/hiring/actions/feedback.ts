'use server';

// Feedback write action. Part of the board's single write path — see ./index
// for the boundary contract. The author is derived server-side from the session
// (never the client), so a caller cannot attribute feedback to a colleague.
//
// Thin wrapper over addFeedbackCore in ../core, the actor-scoped write shared
// with the MCP tools (app/api/mcp/route.ts): the web path attributes the entry
// to the signed-in user resolved by email (currentUserId), the MCP path to the
// token's owner. The core does the zod-parse + DB write and does not revalidate.

import { requireUser } from '@/lib/auth';
import { addFeedbackCore } from '../core';
import { currentUserId } from './support';

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
  // Sparse map from the client (a TraitScores only has keys for scored traits);
  // re-validated in addFeedbackCore. Values allow `undefined` to match that.
  traitScoresRaw: Record<string, number | undefined> = {}
): Promise<number | null> {
  await requireUser();
  const byUser = await currentUserId();
  if (byUser == null) return null;
  return addFeedbackCore(byUser, idRaw, traitScoresRaw, noteRaw);
}
