import { describe, it, expect } from 'vitest';
import {
  normalizeTraitSuggestions,
  validateTraitName,
  mergeTraitSuggestions,
  detectTraitRename,
  renameTraitScoreKey,
  scopeTraitScores,
  MAX_TRAITS,
  MAX_TRAIT_NAME,
  MAX_TRAIT_SUGGESTIONS
} from '@/lib/hiring/helpers';
import type { TraitScores } from '@/lib/hiring/types';

// Pure trait rules shared by the Traits modal, the reducer, and the server
// actions — framework-free, exercised here with plain inputs.

describe('normalizeTraitSuggestions', () => {
  it('returns [] when the raw value is not an array', () => {
    expect(normalizeTraitSuggestions(null)).toEqual([]);
    expect(normalizeTraitSuggestions(undefined)).toEqual([]);
    expect(normalizeTraitSuggestions('Ownership')).toEqual([]);
    expect(normalizeTraitSuggestions({ traits: ['Ownership'] })).toEqual([]);
  });

  it('trims each label', () => {
    expect(normalizeTraitSuggestions(['  Ownership  '])).toEqual(['Ownership']);
  });

  it('de-dupes case-insensitively, keeping the first spelling', () => {
    expect(normalizeTraitSuggestions(['Ownership', 'ownership'])).toEqual([
      'Ownership'
    ]);
  });

  it('drops labels with more than 2 whitespace-words', () => {
    expect(normalizeTraitSuggestions(['a b c'])).toEqual([]);
  });

  it('keeps a hyphenated two-word label ("End-to-end ownership")', () => {
    // Split on whitespace: "End-to-end" + "ownership" = 2 words, so it stays.
    expect(normalizeTraitSuggestions(['End-to-end ownership'])).toEqual([
      'End-to-end ownership'
    ]);
  });

  it(`drops labels longer than ${MAX_TRAIT_NAME} characters`, () => {
    expect(normalizeTraitSuggestions(['x'.repeat(MAX_TRAIT_NAME + 1)])).toEqual(
      []
    );
    expect(normalizeTraitSuggestions(['x'.repeat(MAX_TRAIT_NAME)])).toEqual([
      'x'.repeat(MAX_TRAIT_NAME)
    ]);
  });

  it('skips non-string and empty items', () => {
    expect(
      normalizeTraitSuggestions([1, 'Ownership', null, true, '', '   ', 'Craft'])
    ).toEqual(['Ownership', 'Craft']);
  });

  it(`caps the result at ${MAX_TRAIT_SUGGESTIONS} from a longer valid list`, () => {
    const raw = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
    const out = normalizeTraitSuggestions(raw);
    expect(out).toHaveLength(MAX_TRAIT_SUGGESTIONS);
    expect(out).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });
});

describe('validateTraitName', () => {
  it('rejects an empty / whitespace-only name', () => {
    expect(validateTraitName([], '')).toEqual({
      ok: false,
      reason: 'Enter a trait.'
    });
    expect(validateTraitName([], '   ')).toEqual({
      ok: false,
      reason: 'Enter a trait.'
    });
  });

  it(`rejects a name longer than ${MAX_TRAIT_NAME} characters`, () => {
    expect(validateTraitName([], 'x'.repeat(MAX_TRAIT_NAME + 1))).toEqual({
      ok: false,
      reason: `Trait must be ${MAX_TRAIT_NAME} characters or fewer.`
    });
  });

  it('rejects a name with more than 2 words', () => {
    expect(validateTraitName([], 'systems design mastery')).toEqual({
      ok: false,
      reason: 'Keep traits to 2 words or fewer.'
    });
  });

  it('rejects a case-insensitive duplicate of an existing trait', () => {
    expect(validateTraitName(['Ownership'], 'ownership')).toEqual({
      ok: false,
      reason: 'That trait already exists.'
    });
  });

  it(`rejects once ${MAX_TRAITS} traits already exist`, () => {
    const traits = Array.from({ length: MAX_TRAITS }, (_, i) => `t${i}`);
    expect(validateTraitName(traits, 'Ownership')).toEqual({
      ok: false,
      reason: `Up to ${MAX_TRAITS} traits per job.`
    });
  });

  it('accepts a valid new 1-2 word name', () => {
    expect(validateTraitName(['Ownership'], 'Systems design')).toEqual({
      ok: true
    });
  });
});

describe('mergeTraitSuggestions', () => {
  it('de-dupes suggestions against the existing list (case-insensitive)', () => {
    const result = mergeTraitSuggestions(['Ownership'], ['ownership', 'Craft']);
    expect(result).toEqual({ traits: ['Ownership', 'Craft'], added: 1 });
  });

  it('stops adding once the cap is reached mid-merge', () => {
    const existing = ['t0', 't1', 't2', 't3', 't4', 't5', 't6']; // 7 traits
    const result = mergeTraitSuggestions(existing, ['a', 'b', 'c']);
    // Only one more fits (7 → 8); the remaining two are rejected by the cap.
    expect(result.added).toBe(1);
    expect(result.traits).toHaveLength(MAX_TRAITS);
    expect(result.traits[MAX_TRAITS - 1]).toBe('a');
  });

  it('appends every all-new suggestion and reports the count', () => {
    const result = mergeTraitSuggestions([], ['A', 'B', 'C']);
    expect(result).toEqual({ traits: ['A', 'B', 'C'], added: 3 });
  });
});

describe('detectTraitRename', () => {
  it('returns the mapping for a single 1-for-1 rename', () => {
    expect(detectTraitRename(['A', 'B'], ['X', 'B'])).toEqual({
      from: 'A',
      to: 'X'
    });
  });

  it('detects a case-only rename (exact-string comparison)', () => {
    expect(detectTraitRename(['Comm'], ['comm'])).toEqual({
      from: 'Comm',
      to: 'comm'
    });
  });

  it('returns null for a pure add', () => {
    expect(detectTraitRename(['A'], ['A', 'B'])).toBeNull();
  });

  it('returns null for a pure remove', () => {
    expect(detectTraitRename(['A', 'B'], ['A'])).toBeNull();
  });

  it('returns null for a reorder (same set)', () => {
    expect(detectTraitRename(['A', 'B'], ['B', 'A'])).toBeNull();
  });

  it('returns null for a multi-change (two removed, two added)', () => {
    expect(detectTraitRename(['A', 'B'], ['X', 'Y'])).toBeNull();
  });
});

describe('renameTraitScoreKey', () => {
  it('moves the value from the old key to the new one', () => {
    const scores: TraitScores = { A: 4, B: 3 };
    expect(renameTraitScoreKey(scores, 'A', 'X')).toEqual({ X: 4, B: 3 });
  });

  it('preserves every other key', () => {
    const scores: TraitScores = { A: 4, B: 3, C: 2 };
    const next = renameTraitScoreKey(scores, 'A', 'X');
    expect(next).toEqual({ X: 4, B: 3, C: 2 });
  });

  it('is a no-op (same reference) when the old key is absent', () => {
    const scores: TraitScores = { B: 3 };
    expect(renameTraitScoreKey(scores, 'A', 'X')).toBe(scores);
  });

  it('is a no-op when the new key is already scored (existing wins)', () => {
    const scores: TraitScores = { A: 4, X: 2 };
    const next = renameTraitScoreKey(scores, 'A', 'X');
    expect(next).toBe(scores);
    expect(next.X).toBe(2);
    expect(next.A).toBe(4);
  });
});

// The data-integrity rule behind a feedback write: scores are scoped to the
// job's CURRENT traits so a stale/renamed key can't persist, and `hasAnyScore`
// drives the "empty-after-scoping is a no-op when the job tracks traits" guard.
describe('scopeTraitScores', () => {
  it('keeps only the traits the job currently tracks', () => {
    const result = scopeTraitScores(['Ownership', 'Craft'], {
      Ownership: 4,
      Craft: 3
    });
    expect(result).toEqual({
      scoped: { Ownership: 4, Craft: 3 },
      hasAnyScore: true
    });
  });

  it('drops a stale / renamed key not in the job traits', () => {
    // "Comunication" was renamed to "Communication" on the job; the old key is
    // no longer tracked, so its score must not survive into the persisted entry.
    const result = scopeTraitScores(['Communication', 'Ownership'], {
      Comunication: 4,
      Ownership: 3
    });
    expect(result.scoped).toEqual({ Ownership: 3 });
    expect(result.hasAnyScore).toBe(true);
  });

  it('keeps a valid subset and drops the extraneous keys', () => {
    const result = scopeTraitScores(['A', 'B', 'C'], { A: 4, Z: 2 });
    expect(result).toEqual({ scoped: { A: 4 }, hasAnyScore: true });
  });

  it('reports no scores when every submitted key is stale', () => {
    // Nothing survives scoping → hasAnyScore false → addFeedbackCore rejects the
    // write (returns null) because the job DOES track traits.
    const result = scopeTraitScores(['A', 'B'], { X: 4, Y: 2 });
    expect(result).toEqual({ scoped: {}, hasAnyScore: false });
  });

  it('scopes to empty and reports no scores when the job tracks no traits', () => {
    // A job with no traits allows nothing through; the caller keeps the empty
    // map and still persists (the `jobTraits.length > 0` guard is false), so
    // this is the deliberate "feedback with only a note" path.
    const result = scopeTraitScores([], { A: 4, B: 3 });
    expect(result).toEqual({ scoped: {}, hasAnyScore: false });
  });

  it('handles an empty submission (nothing to score)', () => {
    expect(scopeTraitScores(['A', 'B'], {})).toEqual({
      scoped: {},
      hasAnyScore: false
    });
  });
});
