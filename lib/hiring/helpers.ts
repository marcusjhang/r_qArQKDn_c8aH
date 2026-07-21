// Pure, framework-free helpers over the hiring domain model.

import { FOUNDERS } from './config';
import type { Candidate, Founder } from './types';

export function founderById(id: string): Founder {
  return FOUNDERS.find((f) => f.id === id) ?? FOUNDERS[0];
}

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

/** Max length of a stage name (kept in sync with the DB/zod bound). */
export const MAX_STAGE_NAME = 48;

/**
 * Single source of truth for stage-name rules (non-empty, length, and
 * case-insensitive uniqueness). Shared by the board UI, the optimistic store,
 * and the server action so the three layers can't disagree. Pass the index to
 * ignore when renaming (so a stage doesn't collide with itself).
 */
export function validateStageName(
  stages: string[],
  name: string,
  ignoreIndex = -1
): { ok: boolean; reason?: string } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'Enter a stage name.' };
  if (trimmed.length > MAX_STAGE_NAME) {
    return {
      ok: false,
      reason: `Stage name must be ${MAX_STAGE_NAME} characters or fewer.`
    };
  }
  if (
    stages.some(
      (s, i) => i !== ignoreIndex && s.toLowerCase() === trimmed.toLowerCase()
    )
  ) {
    return { ok: false, reason: 'That stage already exists.' };
  }
  return { ok: true };
}

/**
 * Pure guard for deleting a stage: only allowed when the column is empty and
 * the job would keep at least two stages. Shared by the server action and the
 * client's optimistic pre-check.
 */
export function stageDeletable(
  stages: string[],
  columnHasCandidates: boolean
): { ok: boolean; reason?: string } {
  if (columnHasCandidates) {
    return {
      ok: false,
      reason: 'Move its candidates out first — the column still holds people.'
    };
  }
  if (stages.length <= 2) {
    return { ok: false, reason: 'A pipeline needs at least two stages.' };
  }
  return { ok: true };
}
