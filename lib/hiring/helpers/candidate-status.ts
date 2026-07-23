// Candidate status predicates and the feedback aggregate — the small pure rules
// the board and detail views read to decide visibility and ratings.

import type { Candidate } from '../types';

/** Rejected and Hired are terminal — they're not part of the active pipeline. */
export function isTerminal(c: Candidate): boolean {
  return c.status === 'rejected' || c.status === 'hired';
}

/**
 * Only rejected candidates are hidden from the board by default. Hired
 * candidates stay visible in the Hired column (that's what it's for).
 */
export function isHiddenByDefault(c: Candidate): boolean {
  return c.status === 'rejected';
}

/** Aggregate rating for a candidate, or null when there is no feedback yet. */
export function agg(c: Candidate): number | null {
  if (!c.feedback.length) return null;
  return c.feedback.reduce((a, f) => a + f.rating, 0) / c.feedback.length;
}

/**
 * Whether the signed-in user may leave feedback on a candidate. Feedback is one
 * entry per interviewer (a DB unique constraint) and is always authored by the
 * signed-in user, so they can review only when signed in and have not already
 * reviewed this candidate. Centralized so the detail drawer stays presentational
 * and the rule is unit-testable rather than inlined in the render.
 */
export function canReviewCandidate(
  candidate: Candidate | null | undefined,
  currentUserId: number | null
): boolean {
  if (candidate == null || currentUserId == null) return false;
  return !candidate.feedback.some((f) => f.byUser === currentUserId);
}
