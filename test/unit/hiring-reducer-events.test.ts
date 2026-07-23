import { describe, it, expect } from 'vitest';
import { hiringReducer, type HiringEvent } from '@/lib/hiring/reducer';
import { DEFAULT_STAGES } from '@/lib/hiring/config';
import type { Candidate, HiringState, Job } from '@/lib/hiring/types';

// Minimal candidate factory — only the fields the reducer touches matter.
function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 1,
    jobId: 1,
    name: 'Ada',
    stage: 'Applied',
    stageEnteredAt: new Date(0),
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

function job(over: Partial<Job> = {}): Job {
  return {
    id: 1,
    title: 'Founding Engineer',
    stages: ['Applied', 'Interview', 'Hired'],
    traits: [],
    description: null,
    starred: false,
    ...over
  };
}

// A reusable HiringState fixture. Callers override just the slice they exercise.
function state(over: Partial<HiringState> = {}): HiringState {
  return {
    jobs: [job()],
    candidates: [candidate()],
    users: [
      { id: 1, firstName: 'Ben', lastName: 'Ong', email: 'benong@lightsprint.ai' }
    ],
    sources: [{ id: 1, name: 'Referral' }],
    bands: [{ id: 1, label: 'Senior', minYears: 5 }],
    stageWarnDays: 5,
    ...over
  };
}

describe('hiringReducer', () => {
  describe('reset', () => {
    it('adopts the new snapshot wholesale', () => {
      const fresh = state({ jobs: [job({ id: 42, title: 'Designer' })] });
      const result = hiringReducer(state(), { type: 'reset', state: fresh });
      expect(result).toBe(fresh);
    });
  });

  describe('createJob', () => {
    it('appends a job with the tempId, title, DEFAULT_STAGES and starred=false', () => {
      const initial = state();
      const result = hiringReducer(initial, {
        type: 'createJob',
        tempId: -1,
        title: 'Designer',
        description: 'Design things',
        traits: ['Craft']
      });
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[1]).toEqual({
        id: -1,
        title: 'Designer',
        stages: [...DEFAULT_STAGES],
        traits: ['Craft'],
        description: 'Design things',
        starred: false
      });
      // A fresh copy of DEFAULT_STAGES, not the shared module array.
      expect(result.jobs[1].stages).not.toBe(DEFAULT_STAGES);
    });
  });

  describe('reconcileJobId', () => {
    it('swaps a job tempId for the real id', () => {
      const initial = state({ jobs: [job({ id: -7 })] });
      const result = hiringReducer(initial, {
        type: 'reconcileJobId',
        tempId: -7,
        realId: 99
      });
      expect(result.jobs[0].id).toBe(99);
    });

    it('leaves other jobs untouched', () => {
      const initial = state({ jobs: [job({ id: -7 }), job({ id: 5 })] });
      const result = hiringReducer(initial, {
        type: 'reconcileJobId',
        tempId: -7,
        realId: 99
      });
      expect(result.jobs.map((j) => j.id)).toEqual([99, 5]);
    });
  });

  describe('setJobStarred', () => {
    it('sets the starred flag on the matching job only', () => {
      const initial = state({ jobs: [job({ id: 1 }), job({ id: 2 })] });
      const result = hiringReducer(initial, {
        type: 'setJobStarred',
        jobId: 2,
        starred: true
      });
      expect(result.jobs.find((j) => j.id === 1)!.starred).toBe(false);
      expect(result.jobs.find((j) => j.id === 2)!.starred).toBe(true);
    });
  });

  describe('setJobDescription', () => {
    it('coerces an empty string to null', () => {
      const initial = state({ jobs: [job({ id: 1, description: 'old' })] });
      const result = hiringReducer(initial, {
        type: 'setJobDescription',
        jobId: 1,
        description: ''
      });
      expect(result.jobs[0].description).toBeNull();
    });

    it('stores a non-empty description as-is', () => {
      const initial = state({ jobs: [job({ id: 1, description: null })] });
      const result = hiringReducer(initial, {
        type: 'setJobDescription',
        jobId: 1,
        description: 'Build the platform'
      });
      expect(result.jobs[0].description).toBe('Build the platform');
    });
  });

  describe('setJobTraits', () => {
    it('replaces the trait list and leaves candidates untouched (no rename)', () => {
      const initial = state({
        jobs: [job({ id: 1, traits: ['A', 'B'] })],
        candidates: [candidate({ id: 1, jobId: 1 })]
      });
      // A pure add is not a 1-for-1 rename, so feedback is not remapped and the
      // candidates array is preserved by reference.
      const result = hiringReducer(initial, {
        type: 'setJobTraits',
        jobId: 1,
        traits: ['A', 'B', 'C']
      });
      expect(result.jobs[0].traits).toEqual(['A', 'B', 'C']);
      expect(result.candidates).toBe(initial.candidates);
    });

    it('remaps recorded feedback scores from the old key to the new on a rename', () => {
      const initial = state({
        jobs: [job({ id: 1, traits: ['A', 'B'] })],
        candidates: [
          candidate({
            id: 1,
            jobId: 1,
            feedback: [
              {
                id: 1,
                byUser: 1,
                traitScores: { A: 4, B: 3 },
                note: '',
                stage: 'Applied'
              }
            ]
          })
        ]
      });
      // Old [A, B] → new [X, B]: A is renamed to X, so the score recorded under
      // A must carry over to X (renameTraitScoreKey), B untouched.
      const result = hiringReducer(initial, {
        type: 'setJobTraits',
        jobId: 1,
        traits: ['X', 'B']
      });
      expect(result.jobs[0].traits).toEqual(['X', 'B']);
      const scores = result.candidates[0].feedback[0].traitScores;
      expect(scores).toEqual({ B: 3, X: 4 });
      expect(scores.A).toBeUndefined();
    });
  });

  describe('reorderTrait', () => {
    it('swaps a trait with its neighbour', () => {
      const initial = state({ jobs: [job({ id: 1, traits: ['A', 'B', 'C'] })] });
      const result = hiringReducer(initial, {
        type: 'reorderTrait',
        jobId: 1,
        index: 0,
        dir: 1
      });
      expect(result.jobs[0].traits).toEqual(['B', 'A', 'C']);
    });

    it('is a no-op when the move would fall off the edge', () => {
      const initial = state({ jobs: [job({ id: 1, traits: ['A', 'B'] })] });
      const result = hiringReducer(initial, {
        type: 'reorderTrait',
        jobId: 1,
        index: 0,
        dir: -1
      });
      expect(result.jobs[0].traits).toEqual(['A', 'B']);
    });

    it('is a no-op when the job is missing', () => {
      const initial = state({ jobs: [job({ id: 1, traits: ['A', 'B'] })] });
      const result = hiringReducer(initial, {
        type: 'reorderTrait',
        jobId: 404,
        index: 0,
        dir: 1
      });
      expect(result.jobs).toEqual(initial.jobs);
    });
  });

  describe('deleteJob', () => {
    it('removes the job and all of its candidates', () => {
      const initial = state({
        jobs: [job({ id: 1 }), job({ id: 2 })],
        candidates: [
          candidate({ id: 10, jobId: 1 }),
          candidate({ id: 11, jobId: 2 }),
          candidate({ id: 12, jobId: 1 })
        ]
      });
      const result = hiringReducer(initial, { type: 'deleteJob', jobId: 1 });
      expect(result.jobs.map((j) => j.id)).toEqual([2]);
      expect(result.candidates.map((c) => c.id)).toEqual([11]);
    });
  });

  describe('addCandidate', () => {
    const addEvent = (over: Partial<Extract<HiringEvent, { type: 'addCandidate' }>> = {}) =>
      ({
        type: 'addCandidate',
        tempId: -5,
        jobId: 1,
        name: 'Grace',
        source: 1,
        owner: 1,
        linkedinUrl: null,
        githubUrl: null,
        yearsExperience: null,
        ...over
      }) as HiringEvent;

    it("appends a candidate in the job's first stage with status active", () => {
      const initial = state({
        jobs: [job({ id: 1, stages: ['Sourced', 'Interview', 'Hired'] })],
        candidates: []
      });
      const result = hiringReducer(initial, addEvent());
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({
        id: -5,
        jobId: 1,
        name: 'Grace',
        stage: 'Sourced',
        status: 'active',
        starred: false,
        feedback: []
      });
    });

    it('carries through the optional profile / experience fields', () => {
      const result = hiringReducer(
        state({ candidates: [] }),
        addEvent({
          linkedinUrl: 'https://linkedin.com/in/grace',
          githubUrl: 'https://github.com/grace',
          yearsExperience: 8
        })
      );
      expect(result.candidates[0]).toMatchObject({
        linkedinUrl: 'https://linkedin.com/in/grace',
        githubUrl: 'https://github.com/grace',
        yearsExperience: 8
      });
    });

    it('is a no-op when the job does not exist', () => {
      const initial = state({ candidates: [] });
      const result = hiringReducer(initial, addEvent({ jobId: 404 }));
      expect(result).toBe(initial);
    });
  });

  describe('reconcileCandidateId', () => {
    it('swaps a candidate tempId for the real id', () => {
      const initial = state({ candidates: [candidate({ id: -3 })] });
      const result = hiringReducer(initial, {
        type: 'reconcileCandidateId',
        tempId: -3,
        realId: 77
      });
      expect(result.candidates[0].id).toBe(77);
    });
  });

  describe('moveStage', () => {
    it('marks a candidate hired when moved into the Hired column', () => {
      const initial = state({
        candidates: [candidate({ id: 1, stage: 'Interview', status: 'active' })]
      });
      const result = hiringReducer(initial, {
        type: 'moveStage',
        at: new Date(0),
        id: 1,
        stage: 'Hired'
      });
      expect(result.candidates[0]).toMatchObject({
        stage: 'Hired',
        status: 'hired'
      });
    });

    it('resets a hired candidate back to active when moved out of Hired', () => {
      const initial = state({
        candidates: [candidate({ id: 1, stage: 'Hired', status: 'hired' })]
      });
      const result = hiringReducer(initial, {
        type: 'moveStage',
        at: new Date(0),
        id: 1,
        stage: 'Interview'
      });
      expect(result.candidates[0]).toMatchObject({
        stage: 'Interview',
        status: 'active'
      });
    });

    it('keeps the status for any other move', () => {
      const initial = state({
        candidates: [candidate({ id: 1, stage: 'Applied', status: 'onhold' })]
      });
      const result = hiringReducer(initial, {
        type: 'moveStage',
        at: new Date(0),
        id: 1,
        stage: 'Interview'
      });
      expect(result.candidates[0]).toMatchObject({
        stage: 'Interview',
        status: 'onhold'
      });
    });
  });

  describe('editCandidate', () => {
    it('updates editable fields without touching stage / status / starred', () => {
      const initial = state({
        candidates: [
          candidate({
            id: 1,
            stage: 'Interview',
            status: 'onhold',
            starred: true
          })
        ]
      });
      const result = hiringReducer(initial, {
        type: 'editCandidate',
        id: 1,
        name: 'Grace Hopper',
        source: 2,
        owner: 3,
        linkedinUrl: 'https://linkedin.com/in/gh',
        githubUrl: null,
        yearsExperience: 12
      });
      expect(result.candidates[0]).toMatchObject({
        name: 'Grace Hopper',
        source: 2,
        owner: 3,
        linkedinUrl: 'https://linkedin.com/in/gh',
        githubUrl: null,
        yearsExperience: 12,
        // untouched
        stage: 'Interview',
        status: 'onhold',
        starred: true
      });
    });
  });

  describe('setStatus', () => {
    it("pulls a newly-hired candidate into the job's Hired column", () => {
      const initial = state({
        jobs: [job({ id: 1, stages: ['Applied', 'Interview', 'Hired'] })],
        candidates: [candidate({ id: 1, stage: 'Interview', status: 'active' })]
      });
      const result = hiringReducer(initial, {
        type: 'setStatus',
        at: new Date(0),
        id: 1,
        status: 'hired'
      });
      expect(result.candidates[0]).toMatchObject({
        stage: 'Hired',
        status: 'hired'
      });
    });

    it('leaves the stage in place when the job has no Hired column', () => {
      const initial = state({
        jobs: [job({ id: 1, stages: ['Applied', 'Interview'] })],
        candidates: [candidate({ id: 1, stage: 'Interview', status: 'active' })]
      });
      const result = hiringReducer(initial, {
        type: 'setStatus',
        at: new Date(0),
        id: 1,
        status: 'hired'
      });
      expect(result.candidates[0]).toMatchObject({
        stage: 'Interview',
        status: 'hired'
      });
    });

    it('leaves the stage untouched for non-hired statuses', () => {
      const initial = state({
        candidates: [candidate({ id: 1, stage: 'Interview', status: 'active' })]
      });
      const result = hiringReducer(initial, {
        type: 'setStatus',
        at: new Date(0),
        id: 1,
        status: 'rejected'
      });
      expect(result.candidates[0]).toMatchObject({
        stage: 'Interview',
        status: 'rejected'
      });
    });
  });

  describe('setCandidateStarred', () => {
    it('toggles the starred flag on the matching candidate', () => {
      const initial = state({
        candidates: [candidate({ id: 1, starred: false }), candidate({ id: 2 })]
      });
      const result = hiringReducer(initial, {
        type: 'setCandidateStarred',
        id: 1,
        starred: true
      });
      expect(result.candidates.find((c) => c.id === 1)!.starred).toBe(true);
      expect(result.candidates.find((c) => c.id === 2)!.starred).toBe(false);
    });
  });

  describe('saveFeedback', () => {
    it('appends a feedback entry carrying the tempId and candidate stage', () => {
      const initial = state({
        candidates: [candidate({ id: 1, feedback: [] })]
      });
      const result = hiringReducer(initial, {
        type: 'saveFeedback',
        id: 1,
        tempId: -9,
        byUser: 2,
        traitScores: { Ownership: 4 },
        note: 'Strong hire'
      });
      expect(result.candidates[0].feedback).toEqual([
        {
          id: -9,
          byUser: 2,
          traitScores: { Ownership: 4 },
          note: 'Strong hire',
          stage: 'Applied'
        }
      ]);
    });

    it('appends a new entry after a different user’s feedback', () => {
      const initial = state({
        candidates: [
          candidate({
            id: 1,
            feedback: [
              { id: 1, byUser: 1, traitScores: {}, note: 'ok', stage: 'Applied' }
            ]
          })
        ]
      });
      const result = hiringReducer(initial, {
        type: 'saveFeedback',
        id: 1,
        tempId: -9,
        byUser: 2,
        traitScores: {},
        note: 'meh'
      });
      expect(result.candidates[0].feedback.map((f) => f.id)).toEqual([1, -9]);
    });
  });

  describe('renameStage', () => {
    it('renames the stage and re-points candidates sitting in that column', () => {
      const initial = state({
        jobs: [job({ id: 1, stages: ['Applied', 'Interview', 'Hired'] })],
        candidates: [
          candidate({ id: 1, jobId: 1, stage: 'Interview' }),
          candidate({ id: 2, jobId: 1, stage: 'Applied' })
        ]
      });
      const result = hiringReducer(initial, {
        type: 'renameStage',
        jobId: 1,
        index: 1,
        name: 'Onsite'
      });
      expect(result.jobs[0].stages).toEqual(['Applied', 'Onsite', 'Hired']);
      expect(result.candidates.find((c) => c.id === 1)!.stage).toBe('Onsite');
      // A candidate in a different column keeps its stage.
      expect(result.candidates.find((c) => c.id === 2)!.stage).toBe('Applied');
    });

    it('only re-points candidates belonging to the renamed job', () => {
      const initial = state({
        jobs: [
          job({ id: 1, stages: ['Applied', 'Interview', 'Hired'] }),
          job({ id: 2, stages: ['Applied', 'Interview', 'Hired'] })
        ],
        candidates: [
          candidate({ id: 1, jobId: 1, stage: 'Interview' }),
          candidate({ id: 2, jobId: 2, stage: 'Interview' })
        ]
      });
      const result = hiringReducer(initial, {
        type: 'renameStage',
        jobId: 1,
        index: 1,
        name: 'Onsite'
      });
      expect(result.candidates.find((c) => c.id === 1)!.stage).toBe('Onsite');
      expect(result.candidates.find((c) => c.id === 2)!.stage).toBe('Interview');
    });

    it('is a no-op when the job is missing', () => {
      const initial = state();
      const result = hiringReducer(initial, {
        type: 'renameStage',
        jobId: 404,
        index: 0,
        name: 'X'
      });
      expect(result).toBe(initial);
    });

    it('is a no-op when the stage index is out of bounds', () => {
      const initial = state();
      const result = hiringReducer(initial, {
        type: 'renameStage',
        jobId: 1,
        index: 99,
        name: 'X'
      });
      expect(result).toBe(initial);
    });
  });

  describe('addStage', () => {
    it('inserts a new stage just before the terminal one', () => {
      const initial = state({
        jobs: [job({ id: 1, stages: ['Applied', 'Interview', 'Hired'] })]
      });
      const result = hiringReducer(initial, {
        type: 'addStage',
        jobId: 1,
        name: 'Offer'
      });
      expect(result.jobs[0].stages).toEqual([
        'Applied',
        'Interview',
        'Offer',
        'Hired'
      ]);
    });

    it('leaves stages unchanged when the name is a duplicate', () => {
      const initial = state({
        jobs: [job({ id: 1, stages: ['Applied', 'Interview', 'Hired'] })]
      });
      const result = hiringReducer(initial, {
        type: 'addStage',
        jobId: 1,
        name: 'interview'
      });
      expect(result.jobs[0].stages).toEqual(['Applied', 'Interview', 'Hired']);
    });

    it('is a no-op when the job is missing', () => {
      const initial = state();
      const result = hiringReducer(initial, {
        type: 'addStage',
        jobId: 404,
        name: 'Offer'
      });
      expect(result).toBe(initial);
    });
  });

  describe('reorderStage', () => {
    it('swaps a stage with its right neighbour', () => {
      const initial = state({
        jobs: [job({ id: 1, stages: ['Applied', 'Interview', 'Offer', 'Hired'] })]
      });
      const result = hiringReducer(initial, {
        type: 'reorderStage',
        jobId: 1,
        index: 1,
        dir: 1
      });
      expect(result.jobs[0].stages).toEqual([
        'Applied',
        'Offer',
        'Interview',
        'Hired'
      ]);
    });

    it('leaves stages unchanged when the move would fall off the edge', () => {
      const stages = ['Applied', 'Interview', 'Hired'];
      const initial = state({ jobs: [job({ id: 1, stages })] });
      const result = hiringReducer(initial, {
        type: 'reorderStage',
        jobId: 1,
        index: 0,
        dir: -1
      });
      expect(result.jobs[0].stages).toEqual(stages);
    });
  });

  describe('deleteStage', () => {
    it('removes an empty stage when more than two remain', () => {
      const initial = state({
        jobs: [job({ id: 1, stages: ['Applied', 'Interview', 'Offer', 'Hired'] })],
        candidates: []
      });
      const result = hiringReducer(initial, {
        type: 'deleteStage',
        jobId: 1,
        index: 2
      });
      expect(result.jobs[0].stages).toEqual(['Applied', 'Interview', 'Hired']);
    });

    it('refuses to delete a column that still holds candidates', () => {
      const initial = state({
        jobs: [job({ id: 1, stages: ['Applied', 'Interview', 'Offer', 'Hired'] })],
        candidates: [candidate({ id: 1, jobId: 1, stage: 'Interview' })]
      });
      const result = hiringReducer(initial, {
        type: 'deleteStage',
        jobId: 1,
        index: 1
      });
      expect(result.jobs[0].stages).toEqual([
        'Applied',
        'Interview',
        'Offer',
        'Hired'
      ]);
    });

    it('refuses to drop below two stages', () => {
      const initial = state({
        jobs: [job({ id: 1, stages: ['Applied', 'Hired'] })],
        candidates: []
      });
      const result = hiringReducer(initial, {
        type: 'deleteStage',
        jobId: 1,
        index: 0
      });
      expect(result.jobs[0].stages).toEqual(['Applied', 'Hired']);
    });

    it('is a no-op when the job is missing', () => {
      const initial = state();
      const result = hiringReducer(initial, {
        type: 'deleteStage',
        jobId: 404,
        index: 0
      });
      expect(result).toBe(initial);
    });
  });

  describe('unknown event', () => {
    it('returns the state unchanged', () => {
      const initial = state();
      // A type the union does not know about — the default branch.
      const result = hiringReducer(initial, {
        type: 'somethingElse'
      } as unknown as HiringEvent);
      expect(result).toBe(initial);
    });
  });

  describe('immutability', () => {
    it('does not mutate the input jobs array on createJob', () => {
      const jobs = [job({ id: 1 })];
      const initial = state({ jobs });
      hiringReducer(initial, {
        type: 'createJob',
        tempId: -1,
        title: 'X',
        description: '',
        traits: []
      });
      expect(jobs).toHaveLength(1);
      expect(initial.jobs).toBe(jobs);
    });

    it('does not mutate the input candidates array on deleteJob', () => {
      const candidates = [
        candidate({ id: 10, jobId: 1 }),
        candidate({ id: 11, jobId: 2 })
      ];
      const initial = state({
        jobs: [job({ id: 1 }), job({ id: 2 })],
        candidates
      });
      hiringReducer(initial, { type: 'deleteJob', jobId: 1 });
      expect(candidates.map((c) => c.id)).toEqual([10, 11]);
    });

    it('does not mutate the original candidate object on moveStage', () => {
      const original = candidate({ id: 1, stage: 'Interview', status: 'active' });
      const initial = state({ candidates: [original] });
      const result = hiringReducer(initial, {
        type: 'moveStage',
        at: new Date(0),
        id: 1,
        stage: 'Hired'
      });
      // Original untouched; result holds a fresh object.
      expect(original).toMatchObject({ stage: 'Interview', status: 'active' });
      expect(result.candidates[0]).not.toBe(original);
    });

    it("does not mutate the original job's stages array on addStage", () => {
      const stages = ['Applied', 'Interview', 'Hired'];
      const initial = state({ jobs: [job({ id: 1, stages })] });
      hiringReducer(initial, { type: 'addStage', jobId: 1, name: 'Offer' });
      expect(stages).toEqual(['Applied', 'Interview', 'Hired']);
    });
  });
});
