// Per-job traits and weighted trait scoring. A job's `traits` order IS the ranking (index 0 = most important, most weight); a candidate's headline score is the rank-weighted average of each trait's average across feedback.

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

/** Average score a candidate has for a single trait across every feedback entry that scored it, or null when unscored. */
export function traitAgg(c: Candidate, trait: string): number | null {
  const scores = c.feedback
    .map((f) => f.traitScores?.[trait])
    .filter((v): v is RatingValue => v != null);
  if (!scores.length) return null;
  return scores.reduce((a, v) => a + v, 0) / scores.length;
}

/** Weight of the trait at `index` in a ranked list of `total`: linear by rank — first gets `total`, last gets 1. */
function traitWeight(index: number, total: number): number {
  return total - index;
}

/** A candidate's overall score: the rank-weighted average of each scored trait's average (weight follows position in `traits`), or null when nothing is scored. */
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

/** The average of the trait scores within a single feedback entry, or null when it scored none. */
export function entryTraitAvg(f: Feedback): number | null {
  const scores = Object.values(f.traitScores ?? {}).filter(
    (v): v is RatingValue => v != null
  );
  if (!scores.length) return null;
  return scores.reduce((a, v) => a + v, 0) / scores.length;
}

/** Single source of truth for trait-name rules (non-empty, length, word count, case-insensitive uniqueness, cap). Mirrors validateStageName. */
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

/** Merge AI-suggested traits into an existing list under the same rules as manual entry; returns the new list and how many were added. */
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

/** Normalize an untrusted AI trait-suggestion array (`raw` is `unknown` from JSON.parse): trim, drop empty/over-length/multi-word labels (skip, never truncate), de-dupe case-insensitively, keep the first MAX_TRAIT_SUGGESTIONS. */
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

/** Detect a single 1-for-1 trait rename (exactly one label removed and one added) and return its `{ from, to }`, else null — so pure adds/removes/reorders don't trigger a score remap. Exact-string, so a case-only rename still counts. */
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
  /** The submitted scores intersected with the job's CURRENT traits (stale/renamed keys dropped). */
  scoped: TraitScores;
  /** Whether at least one submitted score survived the scoping. */
  hasAnyScore: boolean;
}

/** Scope submitted `traitScores` to the job's CURRENT `traits`, dropping any stale/renamed key so it can never persist. Returns the scoped map plus `hasAnyScore`. */
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

/** Move a feedback entry's score from `from` to `to` on a rename; a no-op when `from` was unscored or `to` already has a score (existing value wins). */
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
