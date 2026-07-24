// Candidate status predicates and the review-eligibility rule — the pure rules the board and detail views read for visibility and reviewing.

import type { Candidate } from '../types';

/** Rejected and Hired are terminal — they're not part of the active pipeline. */
export function isTerminal(c: Candidate): boolean {
  return c.status === 'rejected' || c.status === 'hired';
}

/** Only rejected candidates are hidden by default; hired ones stay visible in the Hired column. */
export function isHiddenByDefault(c: Candidate): boolean {
  return c.status === 'rejected';
}

/** Whether the signed-in user may leave feedback: only when signed in and they haven't already reviewed this candidate (one entry per interviewer). */
export function canReviewCandidate(
  candidate: Candidate | null | undefined,
  currentUserId: number | null
): boolean {
  if (candidate == null || currentUserId == null) return false;
  return !candidate.feedback.some((f) => f.byUser === currentUserId);
}
