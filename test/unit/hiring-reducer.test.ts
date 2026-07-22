import { describe, it, expect } from 'vitest';
import { hiringReducer } from '@/lib/hiring/reducer';
import type { HiringState } from '@/lib/hiring/types';

// A minimal board with one job and one candidate carrying an optimistic
// (negative temp-id) feedback entry, so the reconciliation paths have something
// to adopt.
function state(over: Partial<HiringState> = {}): HiringState {
  return {
    jobs: [{ id: 1, title: 'Eng', stages: ['Applied', 'Hired'], starred: false }],
    candidates: [
      {
        id: 10,
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
        feedback: []
      }
    ],
    users: [],
    sources: [],
    bands: [],
    ...over
  };
}

describe('addFeedback / reconcileFeedbackId', () => {
  it('appends an optimistic feedback row under a temp id', () => {
    const next = hiringReducer(state(), {
      type: 'addFeedback',
      id: 10,
      tempId: -3,
      byUser: 7,
      rating: 4,
      note: 'Strong'
    });
    expect(next.candidates[0].feedback).toEqual([
      { id: -3, byUser: 7, rating: 4, note: 'Strong' }
    ]);
  });

  it('adopts the server id for the matching temp feedback row', () => {
    const withTemp = hiringReducer(state(), {
      type: 'addFeedback',
      id: 10,
      tempId: -3,
      byUser: 7,
      rating: 4,
      note: 'Strong'
    });
    const reconciled = hiringReducer(withTemp, {
      type: 'reconcileFeedbackId',
      tempId: -3,
      realId: 42
    });
    expect(reconciled.candidates[0].feedback).toEqual([
      { id: 42, byUser: 7, rating: 4, note: 'Strong' }
    ]);
  });

  it('leaves other feedback rows untouched when reconciling', () => {
    const seeded = state();
    seeded.candidates[0].feedback = [
      { id: 5, byUser: 1, rating: 3, note: 'ok' },
      { id: -3, byUser: 7, rating: 4, note: 'new' }
    ];
    const reconciled = hiringReducer(seeded, {
      type: 'reconcileFeedbackId',
      tempId: -3,
      realId: 99
    });
    expect(reconciled.candidates[0].feedback.map((f) => f.id)).toEqual([5, 99]);
  });

  it('is a no-op when no feedback matches the temp id', () => {
    const s = state();
    const reconciled = hiringReducer(s, {
      type: 'reconcileFeedbackId',
      tempId: -99,
      realId: 1
    });
    expect(reconciled.candidates[0].feedback).toEqual([]);
  });
});

describe('reconcileJobId / reconcileCandidateId', () => {
  it('swaps a job temp id for the persisted id', () => {
    const s = state({
      jobs: [{ id: -1, title: 'New', stages: ['Applied'], starred: false }]
    });
    const next = hiringReducer(s, {
      type: 'reconcileJobId',
      tempId: -1,
      realId: 8
    });
    expect(next.jobs[0].id).toBe(8);
  });

  it('swaps a candidate temp id for the persisted id', () => {
    const s = state();
    s.candidates[0].id = -2;
    const next = hiringReducer(s, {
      type: 'reconcileCandidateId',
      tempId: -2,
      realId: 20
    });
    expect(next.candidates[0].id).toBe(20);
  });
});
