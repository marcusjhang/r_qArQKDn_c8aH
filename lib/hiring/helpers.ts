// Pure, framework-free helpers over the hiring domain model.

import { FOUNDERS } from './config';
import type { Candidate, Founder } from './types';

export function founderById(id: string): Founder {
  return FOUNDERS.find((f) => f.id === id) ?? FOUNDERS[0];
}

/** Rejected and Hired are terminal — filtered off the board by default. */
export function isTerminal(c: Candidate): boolean {
  return c.status === 'rejected' || c.status === 'hired';
}

/** Aggregate rating for a candidate, or null when there is no feedback yet. */
export function agg(c: Candidate): number | null {
  if (!c.feedback.length) return null;
  return c.feedback.reduce((a, f) => a + f.v, 0) / c.feedback.length;
}
