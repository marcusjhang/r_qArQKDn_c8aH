import { describe, it, expect } from 'vitest';
import {
  zId,
  zIndex,
  zDir,
  zStatus,
  zName,
  zStageName,
  zJobTitle,
  zNote,
  zProfileUrl,
  zYears,
  zRating,
  candidateInsertSchema,
  candidateEditSchema,
  feedbackInsertSchema
} from '@/lib/hiring/core/schemas';
import {
  STATUSES,
  RATING_VALUES,
  MAX_YEARS_EXPERIENCE
} from '@/lib/hiring/model/primitives';

describe('zId', () => {
  it('accepts positive integers, including large ones', () => {
    expect(zId.safeParse(1).success).toBe(true);
    expect(zId.safeParse(999_999).success).toBe(true);
  });

  it('rejects 0, negatives, non-integers, and NaN', () => {
    expect(zId.safeParse(0).success).toBe(false);
    expect(zId.safeParse(-1).success).toBe(false);
    expect(zId.safeParse(1.5).success).toBe(false);
    expect(zId.safeParse(Number.NaN).success).toBe(false);
  });
});

describe('zIndex', () => {
  it('accepts 0 and positive integers', () => {
    expect(zIndex.safeParse(0).success).toBe(true);
    expect(zIndex.safeParse(7).success).toBe(true);
  });

  it('rejects -1 and non-integers', () => {
    expect(zIndex.safeParse(-1).success).toBe(false);
    expect(zIndex.safeParse(1.5).success).toBe(false);
  });
});

describe('zDir', () => {
  it('accepts 1 and -1', () => {
    expect(zDir.safeParse(1).success).toBe(true);
    expect(zDir.safeParse(-1).success).toBe(true);
  });

  it('rejects 0 and 2', () => {
    expect(zDir.safeParse(0).success).toBe(false);
    expect(zDir.safeParse(2).success).toBe(false);
  });
});

describe('zStatus', () => {
  it('accepts every value in STATUSES', () => {
    for (const status of STATUSES) {
      expect(zStatus.safeParse(status).success).toBe(true);
    }
  });

  it('rejects an unknown string', () => {
    expect(zStatus.safeParse('unknown').success).toBe(false);
  });
});

describe('zName', () => {
  it('accepts a normal name', () => {
    expect(zName.safeParse('Ada Lovelace').success).toBe(true);
  });

  it('trims and rejects empty / whitespace-only strings', () => {
    expect(zName.safeParse('').success).toBe(false);
    expect(zName.safeParse('   ').success).toBe(false);
  });

  it('trims before applying the min bound and returns the trimmed value', () => {
    const result = zName.safeParse('  Ada  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('Ada');
  });

  it('accepts length 120 and rejects length > 120', () => {
    expect(zName.safeParse('x'.repeat(120)).success).toBe(true);
    expect(zName.safeParse('x'.repeat(121)).success).toBe(false);
  });
});

describe('zStageName', () => {
  it('rejects empty', () => {
    expect(zStageName.safeParse('').success).toBe(false);
  });

  it('accepts 48 and rejects > 48', () => {
    expect(zStageName.safeParse('x'.repeat(48)).success).toBe(true);
    expect(zStageName.safeParse('x'.repeat(49)).success).toBe(false);
  });
});

describe('zJobTitle', () => {
  it('rejects empty', () => {
    expect(zJobTitle.safeParse('').success).toBe(false);
  });

  it('accepts 80 and rejects > 80', () => {
    expect(zJobTitle.safeParse('x'.repeat(80)).success).toBe(true);
    expect(zJobTitle.safeParse('x'.repeat(81)).success).toBe(false);
  });
});

describe('zNote', () => {
  it('accepts an empty string', () => {
    expect(zNote.safeParse('').success).toBe(true);
  });

  it('accepts up to 2000 chars and rejects > 2000', () => {
    expect(zNote.safeParse('x'.repeat(2000)).success).toBe(true);
    expect(zNote.safeParse('x'.repeat(2001)).success).toBe(false);
  });
});

describe('zProfileUrl', () => {
  it('collapses a blank / whitespace-only string to null', () => {
    const blank = zProfileUrl.safeParse('');
    expect(blank.success).toBe(true);
    if (blank.success) expect(blank.data).toBeNull();

    const spaces = zProfileUrl.safeParse('   ');
    expect(spaces.success).toBe(true);
    if (spaces.success) expect(spaces.data).toBeNull();
  });

  it('accepts null', () => {
    const result = zProfileUrl.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it('accepts a valid https URL and returns it trimmed', () => {
    const result = zProfileUrl.safeParse('  https://example.com/ada  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('https://example.com/ada');
  });

  it('rejects a non-http(s) URL', () => {
    expect(zProfileUrl.safeParse('ftp://x').success).toBe(false);
  });

  it('rejects a non-URL string', () => {
    expect(zProfileUrl.safeParse('not a url').success).toBe(false);
  });

  it('rejects a URL longer than 500 chars', () => {
    const long = `https://example.com/${'x'.repeat(500)}`;
    expect(long.length).toBeGreaterThan(500);
    expect(zProfileUrl.safeParse(long).success).toBe(false);
  });
});

describe('zYears', () => {
  it('accepts 0, MAX_YEARS_EXPERIENCE, and null', () => {
    expect(zYears.safeParse(0).success).toBe(true);
    expect(zYears.safeParse(MAX_YEARS_EXPERIENCE).success).toBe(true);
    expect(zYears.safeParse(null).success).toBe(true);
  });

  it('rejects -1, MAX_YEARS_EXPERIENCE + 1, and non-integers', () => {
    expect(zYears.safeParse(-1).success).toBe(false);
    expect(zYears.safeParse(MAX_YEARS_EXPERIENCE + 1).success).toBe(false);
    expect(zYears.safeParse(2.5).success).toBe(false);
  });
});

describe('zRating', () => {
  it('accepts each value in RATING_VALUES', () => {
    for (const rating of RATING_VALUES) {
      expect(zRating.safeParse(rating).success).toBe(true);
    }
  });

  it('rejects 0, 5, and non-integers', () => {
    expect(zRating.safeParse(0).success).toBe(false);
    expect(zRating.safeParse(5).success).toBe(false);
    expect(zRating.safeParse(2.5).success).toBe(false);
  });
});

describe('candidateInsertSchema', () => {
  const valid = {
    name: 'Ada Lovelace',
    source: 5,
    owner: 1,
    linkedinUrl: 'https://linkedin.com/in/ada',
    githubUrl: 'https://github.com/ada',
    yearsExperience: 10
  };

  it('accepts a full valid object', () => {
    expect(candidateInsertSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects when name is empty', () => {
    expect(
      candidateInsertSchema.safeParse({ ...valid, name: '' }).success
    ).toBe(false);
  });

  it('rejects when owner is not a positive int', () => {
    expect(
      candidateInsertSchema.safeParse({ ...valid, owner: 0 }).success
    ).toBe(false);
  });

  it('rejects when source is not a positive int', () => {
    expect(
      candidateInsertSchema.safeParse({ ...valid, source: -3 }).success
    ).toBe(false);
  });

  it('picks only {name, source, owner, linkedinUrl, githubUrl, yearsExperience}', () => {
    const result = candidateInsertSchema.safeParse({
      ...valid,
      // Extra columns that exist on the table but are not part of the insert shape.
      id: 99,
      jobId: 1,
      stage: 'Applied',
      status: 'active',
      starred: true,
      createdAt: new Date()
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(
        [
          'githubUrl',
          'linkedinUrl',
          'name',
          'owner',
          'source',
          'yearsExperience'
        ].sort()
      );
    }
  });

  it('is aliased by candidateEditSchema', () => {
    expect(candidateEditSchema).toBe(candidateInsertSchema);
  });
});

describe('feedbackInsertSchema', () => {
  const valid = { byUser: 1, rating: RATING_VALUES[0], note: 'Solid signal' };

  it('accepts a valid {byUser, rating, note}', () => {
    expect(feedbackInsertSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a bad rating', () => {
    expect(
      feedbackInsertSchema.safeParse({ ...valid, rating: 0 }).success
    ).toBe(false);
  });

  it('rejects a non-positive byUser', () => {
    expect(
      feedbackInsertSchema.safeParse({ ...valid, byUser: 0 }).success
    ).toBe(false);
  });
});
