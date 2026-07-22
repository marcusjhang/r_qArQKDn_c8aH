import { describe, it, expect } from 'vitest';
import {
  candidateRating,
  formatJobMeta,
  jobStats,
  liveCount,
  partitionJobTabs,
  roundedRating,
  stageNavigation
} from '@/lib/hiring/helpers';
import type { Candidate, Job, RatingValue } from '@/lib/hiring/types';

// Minimal factories — only the fields each derivation reads matter.
let seq = 0;
function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: ++seq,
    jobId: 1,
    name: 'Ada',
    stage: 'Applied',
    owner: 1,
    source: 1,
    status: 'active',
    starred: false,
    linkedinUrl: null,
    githubUrl: null,
    feedback: [],
    ...over
  };
}

function withRatings(...values: RatingValue[]): Candidate['feedback'] {
  return values.map((v, i) => ({ id: i + 1, byUser: 1, rating: v, note: '' }));
}

function job(over: Partial<Job> = {}): Job {
  return {
    id: 1,
    title: 'Founding Engineer',
    stages: ['Applied', 'Screen', 'Interview', 'Offer', 'Hired'],
    starred: false,
    ...over
  };
}

describe('liveCount', () => {
  it('counts only non-terminal candidates for the given job', () => {
    const cands = [
      candidate({ jobId: 1, status: 'active' }),
      candidate({ jobId: 1, status: 'onhold' }),
      candidate({ jobId: 1, status: 'hired' }),
      candidate({ jobId: 1, status: 'rejected' }),
      candidate({ jobId: 2, status: 'active' })
    ];
    expect(liveCount(cands, 1)).toBe(2);
  });
});

describe('jobStats', () => {
  it('tallies live, hired and rejected for a single job', () => {
    const cands = [
      candidate({ jobId: 1, status: 'active' }),
      candidate({ jobId: 1, status: 'hired' }),
      candidate({ jobId: 1, status: 'hired' }),
      candidate({ jobId: 1, status: 'rejected' }),
      candidate({ jobId: 2, status: 'active' })
    ];
    expect(jobStats(cands, 1)).toEqual({ live: 1, hired: 2, rejected: 1 });
  });
});

describe('formatJobMeta', () => {
  it('pluralizes the active count', () => {
    expect(formatJobMeta({ live: 1, hired: 0, rejected: 0 }, false)).toBe(
      '1 active candidate'
    );
    expect(formatJobMeta({ live: 3, hired: 0, rejected: 0 }, false)).toBe(
      '3 active candidates'
    );
  });

  it('appends hired and hidden-rejected segments', () => {
    expect(formatJobMeta({ live: 2, hired: 1, rejected: 4 }, false)).toBe(
      '2 active candidates · 1 hired · 4 rejected hidden'
    );
  });

  it('omits the rejected segment once those cards are shown', () => {
    expect(formatJobMeta({ live: 2, hired: 0, rejected: 4 }, true)).toBe(
      '2 active candidates'
    );
  });
});

describe('roundedRating / candidateRating', () => {
  it('returns null when there is nothing to round', () => {
    expect(roundedRating(null)).toBeNull();
    expect(candidateRating(candidate())).toBeNull();
  });

  it('rounds to the nearest whole rating', () => {
    expect(roundedRating(3.4)).toBe(3);
    expect(roundedRating(3.5)).toBe(4);
  });

  it('clamps into the 1-4 scale', () => {
    expect(roundedRating(0.2)).toBe(1);
    expect(roundedRating(9)).toBe(4);
  });

  it('derives a candidate rating from its feedback average', () => {
    expect(candidateRating(candidate({ feedback: withRatings(3, 4) }))).toBe(4);
  });
});

describe('stageNavigation', () => {
  it('offers both directions in the middle of the pipeline', () => {
    expect(stageNavigation(job(), candidate({ stage: 'Interview' }))).toEqual({
      index: 2,
      canMoveBack: true,
      canAdvance: true
    });
  });

  it('disallows moving back from the first stage', () => {
    const nav = stageNavigation(job(), candidate({ stage: 'Applied' }));
    expect(nav.canMoveBack).toBe(false);
    expect(nav.canAdvance).toBe(true);
  });

  it('disallows advancing from the last stage', () => {
    const nav = stageNavigation(job(), candidate({ stage: 'Hired' }));
    expect(nav.canAdvance).toBe(false);
    expect(nav.canMoveBack).toBe(true);
  });

  it('is inert without a job or candidate', () => {
    expect(stageNavigation(undefined, null)).toEqual({
      index: -1,
      canMoveBack: false,
      canAdvance: false
    });
  });
});

describe('partitionJobTabs', () => {
  const jobs: Job[] = [
    job({ id: 1, starred: false }),
    job({ id: 2, starred: true }),
    job({ id: 3, starred: false }),
    job({ id: 4, starred: false }),
    job({ id: 5, starred: false })
  ];

  it('puts starred jobs first and caps the inline set', () => {
    const { inline, overflow, favCount } = partitionJobTabs(jobs, 1, 3);
    expect(inline.map((j) => j.id)).toEqual([2, 1, 3]);
    expect(overflow.map((j) => j.id)).toEqual([4, 5]);
    expect(favCount).toBe(1);
  });

  it('keeps the active job inline even when it would overflow', () => {
    const { inline, overflow } = partitionJobTabs(jobs, 5, 3);
    expect(inline.map((j) => j.id)).toContain(5);
    const overflowIds = new Set(overflow.map((j) => j.id));
    expect(inline.some((j) => overflowIds.has(j.id))).toBe(false);
  });

  it('exposes the full starred-first order via sorted', () => {
    const { sorted } = partitionJobTabs(jobs, 1, 3);
    expect(sorted.map((j) => j.id)).toEqual([2, 1, 3, 4, 5]);
  });
});
