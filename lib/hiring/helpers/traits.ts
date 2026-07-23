// Per-job traits and weighted trait scoring — pure, framework-free helpers.
//
// A job's `traits` is an ordered list whose ORDER is the ranking: index 0 is
// rank #1 (most important) and carries the most weight. A candidate's headline
// score is the rank-weighted average of each trait's average score across
// feedback entries. Trait-name validation mirrors the stage-name rules.

import type { Candidate, Feedback, RatingValue } from '../types';
import { type StageGuard } from './stages';

/** Max length of a trait name (kept in sync with the DB/zod bound). */
export const MAX_TRAIT_NAME = 40;

/** A trait is a short label: at most this many whitespace-separated words. */
export const MAX_TRAIT_WORDS = 2;

/** Max length of a job description / JD (kept in sync with the zod bound). */
export const MAX_JOB_DESCRIPTION = 20000;

/** At most this many traits can be tracked on a single job. */
export const MAX_TRAITS = 8;

/** How many traits the AI recommender returns at most (a focused few). */
export const MAX_TRAIT_SUGGESTIONS = 5;

/**
 * Average score a candidate has received for a single trait across every
 * feedback entry that scored it, or null when no interviewer has scored it yet.
 */
export function traitAgg(c: Candidate, trait: string): number | null {
  const scores = c.feedback
    .map((f) => f.traitScores?.[trait])
    .filter((v): v is RatingValue => v != null);
  if (!scores.length) return null;
  return scores.reduce((a, v) => a + v, 0) / scores.length;
}

/**
 * Weight of the trait at `index` within a ranked list of `total` traits. Rank
 * #1 (index 0) is most important and carries the most weight: linear by rank —
 * first gets `total`, last gets 1.
 */
function traitWeight(index: number, total: number): number {
  return total - index;
}

/**
 * A candidate's overall score: the rank-weighted average of each trait's
 * average score, over the traits that have at least one score. `null` when no
 * trait has been scored yet. `traits` is the job's ordered trait list, so a
 * trait's weight follows its position.
 */
export function overallScore(traits: string[], c: Candidate): number | null {
  let num = 0;
  let den = 0;
  traits.forEach((trait, i) => {
    const ta = traitAgg(c, trait);
    if (ta == null) return;
    const w = traitWeight(i, traits.length);
    num += w * ta;
    den += w;
  });
  return den > 0 ? num / den : null;
}

/**
 * The average of the trait scores within a single feedback entry, or null when
 * that entry scored no traits. Used for the collapsed per-entry summary.
 */
export function entryTraitAvg(f: Feedback): number | null {
  const scores = Object.values(f.traitScores ?? {});
  if (!scores.length) return null;
  return scores.reduce((a, v) => a + v, 0) / scores.length;
}

/**
 * Single source of truth for trait-name rules (non-empty, length, and
 * case-insensitive uniqueness within the job). Shared by the Traits modal, the
 * optimistic store, and the server action. Mirrors validateStageName.
 */
export function validateTraitName(traits: string[], name: string): StageGuard {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'Enter a trait.' };
  if (trimmed.length > MAX_TRAIT_NAME) {
    return {
      ok: false,
      reason: `Trait must be ${MAX_TRAIT_NAME} characters or fewer.`
    };
  }
  if (trimmed.split(/\s+/).length > MAX_TRAIT_WORDS) {
    return {
      ok: false,
      reason: `Keep traits to ${MAX_TRAIT_WORDS} words or fewer.`
    };
  }
  if (traits.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, reason: 'That trait already exists.' };
  }
  if (traits.length >= MAX_TRAITS) {
    return { ok: false, reason: `Up to ${MAX_TRAITS} traits per job.` };
  }
  return { ok: true };
}

/**
 * Merge AI-suggested traits into an existing list, enforcing the same rules as
 * manual entry (non-empty, length, unique, cap). Returns the new list and how
 * many suggestions were actually added. Shared by the create and edit modals.
 */
export function mergeTraitSuggestions(
  existing: string[],
  suggestions: string[]
): { traits: string[]; added: number } {
  let traits = [...existing];
  let added = 0;
  for (const s of suggestions) {
    if (validateTraitName(traits, s).ok) {
      traits = [...traits, s.trim()];
      added++;
    }
  }
  return { traits, added };
}
