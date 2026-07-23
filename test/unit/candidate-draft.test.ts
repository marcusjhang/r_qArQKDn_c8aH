import { describe, it, expect } from 'vitest';
import {
  emptyCandidateDraft,
  draftFromCandidate,
  validateCandidateDraft,
  candidateDraftDirty,
  yearsToText,
  MAX_YEARS_EXPERIENCE,
  type CandidateDraft
} from '@/lib/hiring/helpers';
import type { Candidate, Source, User } from '@/lib/hiring/model/types';

const sources: Source[] = [
  { id: 10, name: 'Referral' },
  { id: 11, name: 'LinkedIn' }
];
const users: User[] = [
  { id: 20, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@x.io' },
  { id: 21, firstName: 'Alan', lastName: 'Turing', email: 'alan@x.io' }
];

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 1,
    jobId: 1,
    name: 'Grace Hopper',
    stage: 'Applied',
    owner: 21,
    source: 11,
    yearsExperience: 8,
    status: 'active',
    starred: false,
    linkedinUrl: 'https://www.linkedin.com/in/grace',
    githubUrl: null,
    feedback: [],
    ...over
  };
}

describe('yearsToText', () => {
  it('renders null/undefined as empty string and numbers as-is', () => {
    expect(yearsToText(null)).toBe('');
    expect(yearsToText(undefined)).toBe('');
    expect(yearsToText(0)).toBe('0');
    expect(yearsToText(12)).toBe('12');
  });
});

describe('emptyCandidateDraft', () => {
  it('defaults source/owner to the first option', () => {
    expect(emptyCandidateDraft(sources, users)).toEqual({
      name: '',
      source: 10,
      owner: 20,
      linkedin: '',
      github: '',
      years: ''
    });
  });

  it('falls back to 0 when option lists are empty', () => {
    expect(emptyCandidateDraft([], [])).toMatchObject({ source: 0, owner: 0 });
  });
});

describe('draftFromCandidate', () => {
  it('seeds every field from the candidate', () => {
    expect(draftFromCandidate(candidate(), sources, users)).toEqual({
      name: 'Grace Hopper',
      source: 11,
      owner: 21,
      linkedin: 'https://www.linkedin.com/in/grace',
      github: '',
      years: '8'
    });
  });

  it('falls back to empty draft when candidate is null', () => {
    expect(draftFromCandidate(null, sources, users)).toEqual(
      emptyCandidateDraft(sources, users)
    );
  });
});

describe('validateCandidateDraft', () => {
  const base: CandidateDraft = {
    name: 'Grace',
    source: 11,
    owner: 21,
    linkedin: '',
    github: '',
    years: ''
  };

  it('normalizes a valid draft (blank URLs → null, empty years → null)', () => {
    const res = validateCandidateDraft(base);
    expect(res).toEqual({
      ok: true,
      values: {
        name: 'Grace',
        source: 11,
        owner: 21,
        linkedinUrl: null,
        githubUrl: null,
        yearsExperience: null
      }
    });
  });

  it('trims the name and keeps valid profile URLs and years', () => {
    const res = validateCandidateDraft({
      ...base,
      name: '  Ada  ',
      linkedin: 'https://linkedin.com/in/ada',
      github: 'https://github.com/ada',
      years: '5'
    });
    expect(res).toEqual({
      ok: true,
      values: {
        name: 'Ada',
        source: 11,
        owner: 21,
        linkedinUrl: 'https://linkedin.com/in/ada',
        githubUrl: 'https://github.com/ada',
        yearsExperience: 5
      }
    });
  });

  it('rejects a blank name', () => {
    expect(validateCandidateDraft({ ...base, name: '   ' })).toEqual({
      ok: false,
      error: 'Enter a candidate name.'
    });
  });

  it('rejects a non-http LinkedIn URL', () => {
    expect(validateCandidateDraft({ ...base, linkedin: 'ftp://x' })).toEqual({
      ok: false,
      error: 'LinkedIn must be a valid http(s) URL.'
    });
  });

  it('rejects a non-http GitHub URL', () => {
    expect(validateCandidateDraft({ ...base, github: 'notaurl' })).toEqual({
      ok: false,
      error: 'GitHub must be a valid http(s) URL.'
    });
  });

  it('rejects out-of-range / non-integer years', () => {
    const msg = `Years of experience must be a whole number 0–${MAX_YEARS_EXPERIENCE}.`;
    expect(validateCandidateDraft({ ...base, years: '-1' })).toEqual({
      ok: false,
      error: msg
    });
    expect(validateCandidateDraft({ ...base, years: '1.5' })).toEqual({
      ok: false,
      error: msg
    });
    expect(
      validateCandidateDraft({
        ...base,
        years: String(MAX_YEARS_EXPERIENCE + 1)
      })
    ).toEqual({ ok: false, error: msg });
  });

  it('checks fields in order: name before URLs before years', () => {
    // All three invalid — name wins.
    expect(
      validateCandidateDraft({
        name: '',
        source: 11,
        owner: 21,
        linkedin: 'bad',
        github: 'bad',
        years: 'bad'
      })
    ).toMatchObject({ error: 'Enter a candidate name.' });
  });
});

describe('candidateDraftDirty', () => {
  it('is false against a null view', () => {
    expect(
      candidateDraftDirty(draftFromCandidate(null, sources, users), null)
    ).toBe(false);
  });

  it('is false when the seeded draft is unchanged', () => {
    const c = candidate();
    expect(candidateDraftDirty(draftFromCandidate(c, sources, users), c)).toBe(
      false
    );
  });

  it('ignores whitespace-only edits to text fields', () => {
    const c = candidate();
    const draft = draftFromCandidate(c, sources, users);
    expect(candidateDraftDirty({ ...draft, name: `  ${c.name}  ` }, c)).toBe(
      false
    );
    expect(candidateDraftDirty({ ...draft, years: '  8  ' }, c)).toBe(false);
  });

  it('detects changes to each field', () => {
    const c = candidate();
    const draft = draftFromCandidate(c, sources, users);
    expect(candidateDraftDirty({ ...draft, name: 'Grace H.' }, c)).toBe(true);
    expect(candidateDraftDirty({ ...draft, source: 10 }, c)).toBe(true);
    expect(candidateDraftDirty({ ...draft, owner: 20 }, c)).toBe(true);
    expect(
      candidateDraftDirty({ ...draft, linkedin: 'https://x.io/g' }, c)
    ).toBe(true);
    expect(candidateDraftDirty({ ...draft, github: 'https://x.io/g' }, c)).toBe(
      true
    );
    expect(candidateDraftDirty({ ...draft, years: '9' }, c)).toBe(true);
  });

  it('treats a null githubUrl and an empty-string draft as equal', () => {
    const c = candidate({ githubUrl: null });
    const draft = draftFromCandidate(c, sources, users);
    expect(draft.github).toBe('');
    expect(candidateDraftDirty(draft, c)).toBe(false);
  });
});
