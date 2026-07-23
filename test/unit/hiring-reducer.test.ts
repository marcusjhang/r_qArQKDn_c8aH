// Direct coverage of the board's optimistic state machine (the pure reducer).
// The store's orchestration around it — dispatch timing, server-action wiring,
// temp-id reconciliation flow — is covered in hiring-store.test.tsx; here we
// pin the (state, event) -> state transitions themselves, focusing on the
// feedback optimistic-append + id reconciliation the store now depends on and
// the pre-existing job / candidate reconciliations.

import { describe, it, expect } from 'vitest';
import { hiringReducer, type HiringEvent } from '@/lib/hiring/reducer';
import { DEFAULT_STAGES } from '@/lib/hiring/config';
import type { Candidate, Feedback, HiringState } from '@/lib/hiring/types';

function feedback(over: Partial<Feedback> = {}): Feedback {
  return { id: 1, byUser: 1, rating: 3, note: '', ...over };
}

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
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
    feedback: [],
    ...over
  };
}

function makeState(over: Partial<HiringState> = {}): HiringState {
  return {
    jobs: [
      { id: 1, title: 'Engineer', stages: [...DEFAULT_STAGES], starred: false }
    ],
    candidates: [candidate()],
    users: [],
    sources: [],
    bands: [],
    ...over
  };
}

describe('addFeedback', () => {
  it('appends an optimistic feedback row carrying the temp id', () => {
    const state = makeState();
    const event: HiringEvent = {
      type: 'addFeedback',
      id: 10,
      tempId: -3,
      byUser: 7,
      rating: 4,
      note: 'Strong'
    };

    const next = hiringReducer(state, event);
    const fb = next.candidates[0].feedback;

    expect(fb).toHaveLength(1);
    expect(fb[0]).toEqual({ id: -3, byUser: 7, rating: 4, note: 'Strong' });
    // Other candidates' state and the source array are untouched.
    expect(state.candidates[0].feedback).toHaveLength(0);
  });

  it('leaves other candidates untouched when appending', () => {
    const other = candidate({ id: 20, name: 'Bob' });
    const state = makeState({ candidates: [candidate(), other] });

    const next = hiringReducer(state, {
      type: 'addFeedback',
      id: 10,
      tempId: -1,
      byUser: 2,
      rating: 2,
      note: ''
    });

    expect(next.candidates[1]).toBe(other);
  });
});

describe('reconcileFeedbackId', () => {
  it('adopts the server id for the matching temp feedback row', () => {
    const state = makeState({
      candidates: [candidate({ feedback: [feedback({ id: -5, byUser: 7 })] })]
    });

    const next = hiringReducer(state, {
      type: 'reconcileFeedbackId',
      tempId: -5,
      realId: 501
    });

    const fb = next.candidates[0].feedback[0];
    expect(fb.id).toBe(501);
    // Only the id changes; the rest of the row is preserved.
    expect(fb.byUser).toBe(7);
  });

  it('matches feedback by temp id across candidates', () => {
    const state = makeState({
      candidates: [
        candidate({ id: 10, feedback: [feedback({ id: -1 })] }),
        candidate({ id: 20, feedback: [feedback({ id: -2, byUser: 3 })] })
      ]
    });

    const next = hiringReducer(state, {
      type: 'reconcileFeedbackId',
      tempId: -2,
      realId: 88
    });

    expect(next.candidates[1].feedback[0].id).toBe(88);
    // The candidate that doesn't hold the temp id is left referentially intact.
    expect(next.candidates[0]).toBe(state.candidates[0]);
  });

  it('is a no-op when no feedback carries the temp id', () => {
    const state = makeState({
      candidates: [candidate({ feedback: [feedback({ id: 5 })] })]
    });

    const next = hiringReducer(state, {
      type: 'reconcileFeedbackId',
      tempId: -999,
      realId: 1
    });

    // Nothing matched, so every candidate object is preserved by reference.
    expect(next.candidates[0]).toBe(state.candidates[0]);
  });

  it('leaves already-reconciled feedback on other rows untouched', () => {
    const settled = candidate({
      id: 20,
      feedback: [feedback({ id: 300, byUser: 9 })]
    });
    const state = makeState({
      candidates: [candidate({ feedback: [feedback({ id: -7 })] }), settled]
    });

    const next = hiringReducer(state, {
      type: 'reconcileFeedbackId',
      tempId: -7,
      realId: 12
    });

    expect(next.candidates[0].feedback[0].id).toBe(12);
    expect(next.candidates[1]).toBe(settled);
  });
});

describe('reconcileJobId / reconcileCandidateId', () => {
  it('swaps a job temp id for the server id', () => {
    const state = makeState({
      jobs: [{ id: -1, title: 'Designer', stages: [...DEFAULT_STAGES], starred: false }]
    });

    const next = hiringReducer(state, {
      type: 'reconcileJobId',
      tempId: -1,
      realId: 42
    });

    expect(next.jobs[0].id).toBe(42);
    expect(next.jobs[0].title).toBe('Designer');
  });

  it('swaps a candidate temp id for the server id', () => {
    const state = makeState({ candidates: [candidate({ id: -4, name: 'Cleo' })] });

    const next = hiringReducer(state, {
      type: 'reconcileCandidateId',
      tempId: -4,
      realId: 77
    });

    expect(next.candidates[0].id).toBe(77);
    expect(next.candidates[0].name).toBe('Cleo');
  });
});
