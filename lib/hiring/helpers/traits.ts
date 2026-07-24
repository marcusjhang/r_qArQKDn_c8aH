// Per-job traits and weighted trait scoring — pure, framework-free helpers.
//
// A job's `traits` is an ordered list whose ORDER is the ranking: index 0 is
// rank #1 (most important) and carries the most weight. A candidate's headline
// score is the rank-weighted average of each trait's average score across
// feedback entries. Trait-name validation mirrors the stage-name rules.

import type { Candidate, Feedback, RatingValue, TraitScores } from '../types';
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
  const scores = Object.values(f.traitScores ?? {}).filter(
    (v): v is RatingValue => v != null
  );
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

/**
 * Normalize a raw list of AI trait suggestions (the untrusted `traits` array
 * parsed from the model's JSON) into a clean, length- and count-bounded list:
 * trim; drop empties, over-length (> MAX_TRAIT_NAME) and multi-word
 * (> MAX_TRAIT_WORDS) labels — skipping rather than truncating, since a
 * truncated label is worse than a missing one; de-dupe case-insensitively; and
 * keep only the first MAX_TRAIT_SUGGESTIONS. Pure and framework-free so the
 * AI wrapper (lib/hiring/ai.ts) stays a thin I/O shell and this rule is unit-
 * tested in one place. `raw` is `unknown` because it comes straight from
 * `JSON.parse`.
 */
export function normalizeTraitSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (!t || t.length > MAX_TRAIT_NAME) continue;
    if (t.split(/\s+/).length > MAX_TRAIT_WORDS) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TRAIT_SUGGESTIONS) break;
  }
  return out;
}

/**
 * Detect whether the transition from `oldTraits` to `newTraits` is a single
 * trait *rename* (exactly one label removed and one added, everything else
 * unchanged) and, if so, return the `{ from, to }` mapping — otherwise null.
 *
 * A pure add (nothing removed), pure remove (nothing added) and a reorder (same
 * set) all return null, so the caller only remaps recorded feedback scores on an
 * unambiguous 1-for-1 rename — the case the inline "click to rename" affordance
 * produces. Comparison is exact-string so a case-only rename ("Comunication" →
 * "Communication") is still detected and its scores carried over.
 */
export function detectTraitRename(
  oldTraits: string[],
  newTraits: string[]
): { from: string; to: string } | null {
  const removed = oldTraits.filter((t) => !newTraits.includes(t));
  const added = newTraits.filter((t) => !oldTraits.includes(t));
  if (removed.length === 1 && added.length === 1) {
    return { from: removed[0]!, to: added[0]! };
  }
  return null;
}

/** Result of scoping submitted trait scores to a job's current traits. */
export interface ScopedTraitScores {
  /**
   * The submitted scores intersected with the job's CURRENT traits — every
   * stale or renamed key has been dropped, so only a trait the job still tracks
   * can survive into a persisted feedback entry.
   */
  scoped: TraitScores;
  /** Whether at least one submitted score survived the scoping. */
  hasAnyScore: boolean;
}

/**
 * Scope a client's submitted `traitScores` down to the job's CURRENT `traits`:
 * keep only the entries whose key is still a tracked trait, dropping any
 * stale/renamed key so it can never persist. Returns the scoped map plus
 * `hasAnyScore` (true when anything survived).
 *
 * Pure and framework-free so the server feedback write (addFeedbackCore) and any
 * future caller share one definition of "which scores are allowed to persist",
 * and the data-integrity guarantee is unit-testable without a database. The
 * caller pairs this with the job's trait count to enforce the write rule: when a
 * job tracks any traits, a submission that scopes to nothing is rejected (a
 * no-op); a job with no traits keeps the (empty) map and still persists.
 */
export function scopeTraitScores(
  jobTraits: string[],
  submitted: TraitScores
): ScopedTraitScores {
  const allowed = new Set(jobTraits);
  const scoped: TraitScores = Object.fromEntries(
    Object.entries(submitted ?? {}).filter(([trait]) => allowed.has(trait))
  );
  return { scoped, hasAnyScore: Object.keys(scoped).length > 0 };
}

/**
 * Rewrite a feedback entry's recorded trait scores when a trait is renamed:
 * move the score stored under `from` to `to`, leaving every other trait's score
 * untouched. A no-op when the entry never scored `from`, or when `to` already
 * has a score (the existing value wins — a rename never overwrites a real
 * score). Pure, so the optimistic reducer and the server action share the rule.
 */
export function renameTraitScoreKey(
  scores: TraitScores,
  from: string,
  to: string
): TraitScores {
  const moved = scores[from];
  if (moved == null || scores[to] != null) return scores;
  const next: TraitScores = {};
  for (const [k, v] of Object.entries(scores)) {
    if (k === from) continue;
    next[k] = v;
  }
  next[to] = moved;
  return next;
}
