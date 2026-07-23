// The editable-candidate draft: the raw form shape shared by the add-candidate
// modal and the edit/detail form, plus the validation and dirty-check the two
// share so their rules (and error copy) can't drift.

import { normalizeProfileUrl } from './profile-urls';
import { parseYearsInput, yearsToText, MAX_YEARS_EXPERIENCE } from './seniority';
import type { Candidate, Source, User } from '../types';

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
