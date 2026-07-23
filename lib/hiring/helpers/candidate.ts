// Pure helpers for the candidate add/edit draft: profile-URL and years-of-
// experience normalization, the shared draft shape, its validation and
// dirty-check, and the seniority-band lookup derived from years. Shared by the
// add-candidate modal and the detail/edit form so the two can't drift, and by
// the server action's mirror rules.

import { MAX_YEARS_EXPERIENCE } from '../model/primitives';
import type { Candidate, SeniorityBand, Source, User } from '../model/types';

/** Max length of a profile URL (kept in sync with the zProfileUrl bound). */
export const MAX_PROFILE_URL = 500;

/** Placeholder hints for the optional profile-link inputs, shared by the add-
 * and edit-candidate forms so the two can't drift. */
export const LINKEDIN_URL_PLACEHOLDER = 'https://www.linkedin.com/in/…';
export const GITHUB_URL_PLACEHOLDER = 'https://github.com/…';

/**
 * Client-side mirror of the server's zProfileUrl rule: a blank/whitespace value
 * is a valid "no link" (→ null); anything else must be an http(s) URL of at
 * most MAX_PROFILE_URL characters. Shared by the add- and edit-candidate forms
 * so their validation can't drift from the server action.
 */
export function normalizeProfileUrl(raw: string): {
  ok: boolean;
  value: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_PROFILE_URL || !/^https?:\/\//i.test(trimmed)) {
    return { ok: false, value: null };
  }
  try {
    new URL(trimmed);
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, value: null };
  }
}

/**
 * Seniority band label for a candidate's years of experience against the
 * configurable `bands` (from board state / DB), or null when experience is
 * unspecified or no band's threshold is met. Bands are scanned high-to-low so
 * the highest threshold the value meets wins, regardless of input order.
 */
export function seniorityFor(
  bands: SeniorityBand[],
  years: number | null | undefined
): string | null {
  if (years == null) return null;
  return [...bands]
    .sort((a, b) => b.minYears - a.minYears)
    .find((b) => years >= b.minYears)?.label ?? null;
}

/**
 * Parse a years-of-experience text input into the value we persist. Empty =
 * unspecified (null). Shared by the add-candidate modal and the detail drawer
 * so both enforce the same rule (whole number, 0…MAX_YEARS_EXPERIENCE).
 */
export function parseYearsInput(raw: string): {
  value: number | null;
  ok: boolean;
} {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, ok: true };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > MAX_YEARS_EXPERIENCE) {
    return { value: null, ok: false };
  }
  return { value: n, ok: true };
}

/**
 * The editable candidate fields, as raw form strings/ids. Shared by the add-
 * candidate modal and the edit/detail form so both drive the same
 * `<CandidateFields>` and validate through `validateCandidateDraft`. Years is
 * kept as the raw input string (empty = unspecified) until validated.
 */
export interface CandidateDraft {
  name: string;
  source: number;
  owner: number;
  linkedin: string;
  github: string;
  years: string;
}

/** Canonical text form of a stored years value (null → empty string). */
export function yearsToText(years: number | null | undefined): string {
  return years == null ? '' : String(years);
}

/**
 * A blank draft, defaulting the source/owner selects to the first available
 * option (matching the add-candidate form's initial state).
 */
export function emptyCandidateDraft(
  sources: Source[],
  users: User[]
): CandidateDraft {
  return {
    name: '',
    source: sources[0]?.id ?? 0,
    owner: users[0]?.id ?? 0,
    linkedin: '',
    github: '',
    years: ''
  };
}

/**
 * Seed a draft from an existing candidate (edit mode), falling back to the
 * first source/owner option when the candidate is null or its FK is unset.
 */
export function draftFromCandidate(
  c: Candidate | null,
  sources: Source[],
  users: User[]
): CandidateDraft {
  return {
    name: c?.name ?? '',
    source: c?.source ?? sources[0]?.id ?? 0,
    owner: c?.owner ?? users[0]?.id ?? 0,
    linkedin: c?.linkedinUrl ?? '',
    github: c?.githubUrl ?? '',
    years: yearsToText(c?.yearsExperience)
  };
}

/** The normalized, persist-ready candidate values a valid draft produces. */
export interface CandidateDraftValues {
  name: string;
  source: number;
  owner: number;
  linkedinUrl: string | null;
  githubUrl: string | null;
  yearsExperience: number | null;
}

/**
 * Validate a candidate draft with the exact rules (and error copy) shared by
 * the add- and edit-candidate forms: a required name, http(s) profile URLs (or
 * blank), and a whole-number years value in range. Returns the normalized
 * values on success, or the message to surface on the first failing field.
 */
export function validateCandidateDraft(
  draft: CandidateDraft
): { ok: true; values: CandidateDraftValues } | { ok: false; error: string } {
  const name = draft.name.trim();
  if (!name) {
    return { ok: false, error: 'Enter a candidate name.' };
  }
  const li = normalizeProfileUrl(draft.linkedin);
  if (!li.ok) {
    return { ok: false, error: 'LinkedIn must be a valid http(s) URL.' };
  }
  const gh = normalizeProfileUrl(draft.github);
  if (!gh.ok) {
    return { ok: false, error: 'GitHub must be a valid http(s) URL.' };
  }
  const years = parseYearsInput(draft.years);
  if (!years.ok) {
    return {
      ok: false,
      error: `Years of experience must be a whole number 0–${MAX_YEARS_EXPERIENCE}.`
    };
  }
  return {
    ok: true,
    values: {
      name,
      source: draft.source,
      owner: draft.owner,
      linkedinUrl: li.value,
      githubUrl: gh.value,
      yearsExperience: years.value
    }
  };
}

/**
 * Whether a draft differs from the candidate it was seeded from — the edit
 * form's "dirty" check that gates Save. Trims text fields the same way
 * validation does so whitespace-only edits don't count as changes.
 */
export function candidateDraftDirty(
  draft: CandidateDraft,
  view: Candidate | null
): boolean {
  if (!view) return false;
  return (
    draft.name.trim() !== view.name ||
    draft.source !== view.source ||
    draft.owner !== view.owner ||
    draft.linkedin.trim() !== (view.linkedinUrl ?? '') ||
    draft.github.trim() !== (view.githubUrl ?? '') ||
    draft.years.trim() !== yearsToText(view.yearsExperience)
  );
}
