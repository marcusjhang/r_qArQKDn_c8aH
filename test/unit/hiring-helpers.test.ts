import { describe, it, expect } from 'vitest';
import {
  userById,
  sourceName,
  displayName,
  initials,
  normalizeProfileUrl,
  mentionPresent,
  seniorityFor,
  parseYearsInput,
  isTerminal,
  isHiddenByDefault,
  agg,
  MAX_PROFILE_URL
} from '@/lib/hiring/helpers';
import { MAX_YEARS_EXPERIENCE } from '@/lib/hiring/primitives';
import type { Candidate, SeniorityBand, Source, User } from '@/lib/hiring/types';

// ── Minimal factories ──────────────────────────────────────────────────────

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 1,
    jobId: 1,
    name: 'Ada',
    stage: 'Applied',
    owner: 1,
    source: 1,
    yearsExperience: null,
    status: 'active',
    starred: false,
    linkedinUrl: null,
    githubUrl: null,
    feedback: [],
    ...over
  };
}

function user(over: Partial<User> = {}): User {
  return {
    id: 1,
    firstName: 'Ben',
    lastName: 'Ong',
    email: 'benong@lightsprint.ai',
    ...over
  };
}

function source(over: Partial<Source> = {}): Source {
  return { id: 1, name: 'Referral', ...over };
}

function band(over: Partial<SeniorityBand> = {}): SeniorityBand {
  return { id: 1, label: 'Mid', minYears: 3, ...over };
}

// ── userById ───────────────────────────────────────────────────────────────

describe('userById', () => {
  const users = [user({ id: 1 }), user({ id: 2, email: 'other@test.com' })];

  it('returns the matching user', () => {
    expect(userById(users, 1)?.id).toBe(1);
    expect(userById(users, 2)?.id).toBe(2);
  });

  it('returns undefined when no user has that id', () => {
    expect(userById(users, 99)).toBeUndefined();
  });

  it('returns undefined for an empty list', () => {
    expect(userById([], 1)).toBeUndefined();
  });
});

// ── sourceName ─────────────────────────────────────────────────────────────

describe('sourceName', () => {
  const sources: Source[] = [
    source({ id: 1, name: 'Referral' }),
    source({ id: 2, name: 'LinkedIn' })
  ];

  it('returns the name of the matching source', () => {
    expect(sourceName(sources, 1)).toBe('Referral');
    expect(sourceName(sources, 2)).toBe('LinkedIn');
  });

  it('falls back to "Unknown" when the id is not found', () => {
    expect(sourceName(sources, 99)).toBe('Unknown');
  });

  it('falls back to "Unknown" for an empty list', () => {
    expect(sourceName([], 1)).toBe('Unknown');
  });
});

// ── displayName ────────────────────────────────────────────────────────────

describe('displayName', () => {
  it('joins first and last name with a space', () => {
    expect(
      displayName({ firstName: 'Ben', lastName: 'Ong', email: 'b@test.com' })
    ).toBe('Ben Ong');
  });

  it('returns just the first name when last name is absent', () => {
    expect(
      displayName({ firstName: 'Ben', lastName: null, email: 'b@test.com' })
    ).toBe('Ben');
  });

  it('returns just the last name when first name is absent', () => {
    expect(
      displayName({ firstName: null, lastName: 'Ong', email: 'b@test.com' })
    ).toBe('Ong');
  });

  it('falls back to email when both name parts are null', () => {
    expect(
      displayName({ firstName: null, lastName: null, email: 'b@test.com' })
    ).toBe('b@test.com');
  });

  it('falls back to email when both name parts are empty/whitespace', () => {
    expect(
      displayName({ firstName: '   ', lastName: '   ', email: 'b@test.com' })
    ).toBe('b@test.com');
  });

  it('returns "Unknown" when the user is undefined', () => {
    expect(displayName(undefined)).toBe('Unknown');
  });
});

// ── initials ───────────────────────────────────────────────────────────────

describe('initials', () => {
  it('takes first letter of first and last word for two-word names', () => {
    expect(
      initials({ firstName: 'Ben', lastName: 'Ong', email: 'b@test.com' })
    ).toBe('BO');
  });

  it('uses first and last word for multi-word names', () => {
    // "Heng Hong Lee" → first word H, last word L
    expect(
      initials({
        firstName: 'Heng Hong',
        lastName: 'Lee',
        email: 'hhl@test.com'
      })
    ).toBe('HL');
  });

  it('returns first two letters uppercased for a single-word name', () => {
    expect(
      initials({ firstName: 'Ben', lastName: null, email: 'b@test.com' })
    ).toBe('BE');
  });

  it('returns first two letters of email when no name parts are set', () => {
    const result = initials({
      firstName: null,
      lastName: null,
      email: 'benong@test.com'
    });
    // displayName falls back to email; email is one word → first 2 chars uppercased
    expect(result).toBe('BE');
  });

  it('returns "Unknown" → "UN" for an undefined user', () => {
    // displayName(undefined) === 'Unknown' → single word → 'UN'
    expect(initials(undefined)).toBe('UN');
  });

  it('uppercases the result', () => {
    expect(
      initials({ firstName: 'ada', lastName: 'lovelace', email: 'a@test.com' })
    ).toBe('AL');
  });
});

// ── normalizeProfileUrl ────────────────────────────────────────────────────

describe('normalizeProfileUrl', () => {
  it('returns ok:true, value:null for an empty string', () => {
    expect(normalizeProfileUrl('')).toEqual({ ok: true, value: null });
  });

  it('returns ok:true, value:null for a whitespace-only string', () => {
    expect(normalizeProfileUrl('   ')).toEqual({ ok: true, value: null });
  });

  it('returns ok:true and the trimmed URL for a valid https URL', () => {
    const url = 'https://www.linkedin.com/in/benong';
    expect(normalizeProfileUrl(url)).toEqual({ ok: true, value: url });
    expect(normalizeProfileUrl('  ' + url + '  ')).toEqual({
      ok: true,
      value: url
    });
  });

  it('returns ok:true for a valid http URL', () => {
    const url = 'http://github.com/user';
    expect(normalizeProfileUrl(url)).toEqual({ ok: true, value: url });
  });

  it('rejects a non-http(s) scheme', () => {
    expect(normalizeProfileUrl('ftp://example.com')).toEqual({
      ok: false,
      value: null
    });
    expect(normalizeProfileUrl('javascript:alert(1)')).toEqual({
      ok: false,
      value: null
    });
  });

  it('rejects a bare hostname (no scheme)', () => {
    expect(normalizeProfileUrl('linkedin.com/in/user')).toEqual({
      ok: false,
      value: null
    });
  });

  it('rejects a URL that exceeds MAX_PROFILE_URL characters', () => {
    const long = 'https://example.com/' + 'a'.repeat(MAX_PROFILE_URL);
    expect(normalizeProfileUrl(long).ok).toBe(false);
  });

  it('accepts a URL exactly at MAX_PROFILE_URL characters', () => {
    // Build a URL whose trimmed length is exactly MAX_PROFILE_URL.
    const prefix = 'https://example.com/';
    const url = prefix + 'a'.repeat(MAX_PROFILE_URL - prefix.length);
    expect(url.length).toBe(MAX_PROFILE_URL);
    expect(normalizeProfileUrl(url).ok).toBe(true);
  });
});

// ── mentionPresent ─────────────────────────────────────────────────────────

describe('mentionPresent', () => {
  // Core correctness — shorter name must NOT match inside a longer token.
  it('matches @Ann at the end of a string', () => {
    expect(mentionPresent('Hello @Ann', 'Ann')).toBe(true);
  });

  it('does NOT match @Ann inside @Anna', () => {
    expect(mentionPresent('Hello @Anna', 'Ann')).toBe(false);
  });

  it('does NOT match @Ann inside @Anna in the middle of text', () => {
    expect(mentionPresent('cc @Anna please review', 'Ann')).toBe(false);
  });

  it('matches @Ann when followed by a space', () => {
    expect(mentionPresent('@Ann and @Anna', 'Ann')).toBe(true);
  });

  it('matches @Ann when followed by a punctuation character', () => {
    expect(mentionPresent('@Ann, can you check?', 'Ann')).toBe(true);
  });

  it('does NOT match when @name is followed by a digit', () => {
    // digits are \d — treated as name chars in the regex
    expect(mentionPresent('@Ann1 review', 'Ann')).toBe(false);
  });

  it('matches when @name appears mid-sentence between spaces', () => {
    expect(mentionPresent('ping @Bob please', 'Bob')).toBe(true);
  });

  it('returns false when the name is absent entirely', () => {
    expect(mentionPresent('Hello world', 'Ann')).toBe(false);
  });

  it('returns false for an empty text string', () => {
    expect(mentionPresent('', 'Ann')).toBe(false);
  });

  it('handles names with regex-special characters safely', () => {
    // name containing a dot should be escaped
    expect(mentionPresent('Hello @Ann.Smith!', 'Ann.Smith')).toBe(true);
    expect(mentionPresent('Hello @AnnXSmith!', 'Ann.Smith')).toBe(false);
  });

  it('does NOT match without the @ prefix', () => {
    expect(mentionPresent('Ann is here', 'Ann')).toBe(false);
  });

  it('is case-sensitive — @ann does not match name "Ann"', () => {
    expect(mentionPresent('hey @ann', 'Ann')).toBe(false);
  });

  it('handles unicode letter boundary: @Ångström not matched by @Å', () => {
    // 'Å' is a \p{L}, so @Å should not match inside @Ångström
    expect(mentionPresent('Hello @Ångström', 'Å')).toBe(false);
  });

  it('matches @Ångström exactly', () => {
    expect(mentionPresent('Hello @Ångström!', 'Ångström')).toBe(true);
  });
});

// ── seniorityFor ───────────────────────────────────────────────────────────

describe('seniorityFor', () => {
  const bands: SeniorityBand[] = [
    band({ id: 1, label: 'Junior', minYears: 0 }),
    band({ id: 2, label: 'Mid', minYears: 3 }),
    band({ id: 3, label: 'Senior', minYears: 6 }),
    band({ id: 4, label: 'Staff', minYears: 10 })
  ];

  it('returns the highest band whose threshold is met', () => {
    expect(seniorityFor(bands, 10)).toBe('Staff');
    expect(seniorityFor(bands, 6)).toBe('Senior');
    expect(seniorityFor(bands, 5)).toBe('Mid');
    expect(seniorityFor(bands, 0)).toBe('Junior');
  });

  it('returns the correct band regardless of the order bands are provided', () => {
    // Reverse order — should still produce the highest-threshold match.
    const reversed = [...bands].reverse();
    expect(seniorityFor(reversed, 7)).toBe('Senior');
    expect(seniorityFor(reversed, 3)).toBe('Mid');
  });

  it('returns null when years is null', () => {
    expect(seniorityFor(bands, null)).toBeNull();
  });

  it('returns null when years is undefined', () => {
    expect(seniorityFor(bands, undefined)).toBeNull();
  });

  it('returns null when no band threshold is met', () => {
    const highBands: SeniorityBand[] = [
      band({ id: 1, label: 'Senior', minYears: 5 })
    ];
    expect(seniorityFor(highBands, 3)).toBeNull();
  });

  it('returns null for an empty bands array', () => {
    expect(seniorityFor([], 10)).toBeNull();
  });

  it('does not mutate the input bands array', () => {
    const input = [...bands];
    const before = input.map((b) => b.id);
    seniorityFor(input, 5);
    expect(input.map((b) => b.id)).toEqual(before);
  });
});

// ── parseYearsInput ────────────────────────────────────────────────────────

describe('parseYearsInput', () => {
  it('treats an empty string as unspecified (null, ok)', () => {
    expect(parseYearsInput('')).toEqual({ value: null, ok: true });
    expect(parseYearsInput('   ')).toEqual({ value: null, ok: true });
  });

  it('parses valid whole-number inputs within range', () => {
    expect(parseYearsInput('0')).toEqual({ value: 0, ok: true });
    expect(parseYearsInput('5')).toEqual({ value: 5, ok: true });
    expect(parseYearsInput(String(MAX_YEARS_EXPERIENCE))).toEqual({
      value: MAX_YEARS_EXPERIENCE,
      ok: true
    });
  });

  it('trims whitespace before parsing', () => {
    expect(parseYearsInput('  5  ')).toEqual({ value: 5, ok: true });
  });

  it('rejects a non-integer (decimal with fractional part)', () => {
    expect(parseYearsInput('3.5')).toEqual({ value: null, ok: false });
    expect(parseYearsInput('0.1')).toEqual({ value: null, ok: false });
  });

  it('accepts "1.0" because Number("1.0") === 1 is an integer', () => {
    // Number.isInteger(1.0) is true in JS — the implementation accepts this.
    expect(parseYearsInput('1.0')).toEqual({ value: 1, ok: true });
  });

  it('rejects a negative number', () => {
    expect(parseYearsInput('-1')).toEqual({ value: null, ok: false });
  });

  it('rejects a value exceeding MAX_YEARS_EXPERIENCE', () => {
    expect(parseYearsInput(String(MAX_YEARS_EXPERIENCE + 1))).toEqual({
      value: null,
      ok: false
    });
  });

  it('rejects non-numeric text', () => {
    expect(parseYearsInput('abc')).toEqual({ value: null, ok: false });
    expect(parseYearsInput('5a')).toEqual({ value: null, ok: false });
  });

  it('rejects an empty-but-spaced string as ok (no error shown)', () => {
    // This is just re-confirming the blank branch — different from non-numeric.
    const result = parseYearsInput('   ');
    expect(result.ok).toBe(true);
    expect(result.value).toBeNull();
  });
});

// ── isTerminal / isHiddenByDefault ─────────────────────────────────────────

describe('isTerminal', () => {
  it('returns true for rejected candidates', () => {
    expect(isTerminal(candidate({ status: 'rejected' }))).toBe(true);
  });

  it('returns true for hired candidates', () => {
    expect(isTerminal(candidate({ status: 'hired' }))).toBe(true);
  });

  it('returns false for active candidates', () => {
    expect(isTerminal(candidate({ status: 'active' }))).toBe(false);
  });

  it('returns false for on-hold candidates', () => {
    expect(isTerminal(candidate({ status: 'onhold' }))).toBe(false);
  });
});

describe('isHiddenByDefault', () => {
  it('hides only rejected candidates by default', () => {
    expect(isHiddenByDefault(candidate({ status: 'rejected' }))).toBe(true);
  });

  it('does not hide hired candidates (they appear in the Hired column)', () => {
    expect(isHiddenByDefault(candidate({ status: 'hired' }))).toBe(false);
  });

  it('does not hide active or on-hold candidates', () => {
    expect(isHiddenByDefault(candidate({ status: 'active' }))).toBe(false);
    expect(isHiddenByDefault(candidate({ status: 'onhold' }))).toBe(false);
  });
});

// ── agg ───────────────────────────────────────────────────────────────────

describe('agg', () => {
  it('returns null when there is no feedback', () => {
    expect(agg(candidate({ feedback: [] }))).toBeNull();
  });

  it('returns the mean of a single rating', () => {
    expect(
      agg(candidate({ feedback: [{ id: 1, byUser: 1, rating: 3, note: '' }] }))
    ).toBe(3);
  });

  it('returns the mean of multiple ratings', () => {
    expect(
      agg(
        candidate({
          feedback: [
            { id: 1, byUser: 1, rating: 2, note: '' },
            { id: 2, byUser: 2, rating: 4, note: '' }
          ]
        })
      )
    ).toBe(3);
  });

  it('returns a fractional mean without rounding', () => {
    expect(
      agg(
        candidate({
          feedback: [
            { id: 1, byUser: 1, rating: 1, note: '' },
            { id: 2, byUser: 2, rating: 2, note: '' },
            { id: 3, byUser: 3, rating: 4, note: '' }
          ]
        })
      )
    ).toBeCloseTo(7 / 3);
  });
});
