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
  return addFeedbackCore(byUser, idRaw, ratingRaw, noteRaw);
}
