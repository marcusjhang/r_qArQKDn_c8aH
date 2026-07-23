// The board's optimistic state machine. Every mutation the UI makes is a pure
// (state, event) -> state transition described here, so the optimistic
// projection lives in exactly one place instead of scattered setState
// closures. The client store (useHiringStore) dispatches an event for the
// immediate optimistic update and fires the matching server action to persist
// the same change; the two temp-id reconciliations (createJob / addCandidate)
// and the error-recovery `reset` are just more events.
//
// All stage/candidate placement logic is delegated to the shared pure helpers
// (placeInStage, placeWithStatus, addStageToPipeline, reorderStages,
// removeStage) so the reducer, the store's pre-checks, and the server actions
// all compute the same result from the same code.

import { DEFAULT_STAGES } from '../model/config';
import {
  addStageToPipeline,
  placeInStage,
  placeWithStatus,
  removeStage,
  reorderStages
} from '../helpers';
import type { Candidate, HiringState, RatingValue, Status } from '../model/types';

export type HiringEvent =
  // Adopt a fresh server snapshot (error recovery after a failed write).
  | { type: 'reset'; state: HiringState }
  // Jobs
  | { type: 'createJob'; tempId: number; title: string }
  | { type: 'reconcileJobId'; tempId: number; realId: number }
  | { type: 'setJobStarred'; jobId: number; starred: boolean }
  | { type: 'deleteJob'; jobId: number }
  // Candidates
  | {
      type: 'addCandidate';
      tempId: number;
      jobId: number;
      name: string;
      source: number;
      owner: number;
      linkedinUrl: string | null;
      githubUrl: string | null;
      yearsExperience: number | null;
    }
  | { type: 'reconcileCandidateId'; tempId: number; realId: number }
  | { type: 'moveStage'; id: number; stage: string }
  | {
      type: 'editCandidate';
      id: number;
      name: string;
      source: number;
      owner: number;
      linkedinUrl: string | null;
      githubUrl: string | null;
      yearsExperience: number | null;
    }
  | { type: 'setStatus'; id: number; status: Status }
  | { type: 'setCandidateStarred'; id: number; starred: boolean }
  | {
      type: 'addFeedback';
      id: number;
      tempId: number;
      byUser: number;
      rating: RatingValue;
      note: string;
    }
  | { type: 'reconcileFeedbackId'; tempId: number; realId: number }
  // Stages (edits to a job's ordered stage list)
  | { type: 'renameStage'; jobId: number; index: number; name: string }
  | { type: 'addStage'; jobId: number; name: string }
  | { type: 'reorderStage'; jobId: number; index: number; dir: 1 | -1 }
  | { type: 'deleteStage'; jobId: number; index: number };

/** Map every candidate matching `id`, leaving the rest untouched. */
function mapCandidate(
  state: HiringState,
  id: number,
  fn: (c: Candidate) => Candidate
): HiringState {
  return {
    ...state,
    candidates: state.candidates.map((c) => (c.id === id ? fn(c) : c))
  };
}

/** Replace one job's stage list, or no-op when the job is missing / null. */
function setJobStages(
  state: HiringState,
  jobId: number,
  next: string[] | null
): HiringState {
  if (!next) return state;
  return {
    ...state,
    jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, stages: next } : j))
  };
}

export function hiringReducer(
  state: HiringState,
  event: HiringEvent
): HiringState {
  switch (event.type) {
    case 'reset':
      return event.state;

    case 'createJob':
      return {
        ...state,
        jobs: [
          ...state.jobs,
          {
            id: event.tempId,
            title: event.title,
            stages: [...DEFAULT_STAGES],
            starred: false
          }
        ]
      };

    case 'reconcileJobId':
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === event.tempId ? { ...j, id: event.realId } : j
        )
      };

    case 'setJobStarred':
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === event.jobId ? { ...j, starred: event.starred } : j
        )
      };

    case 'deleteJob':
      return {
        ...state,
        jobs: state.jobs.filter((j) => j.id !== event.jobId),
        candidates: state.candidates.filter((c) => c.jobId !== event.jobId)
      };

    case 'addCandidate': {
      const job = state.jobs.find((j) => j.id === event.jobId);
      if (!job) return state;
      return {
        ...state,
        candidates: [
          ...state.candidates,
          {
            id: event.tempId,
            jobId: event.jobId,
            name: event.name,
            stage: job.stages[0],
            owner: event.owner,
            source: event.source,
            status: 'active',
            starred: false,
            linkedinUrl: event.linkedinUrl,
            githubUrl: event.githubUrl,
            yearsExperience: event.yearsExperience,
            feedback: []
          }
        ]
      };
    }

    case 'reconcileCandidateId':
      return mapCandidate(state, event.tempId, (c) => ({
        ...c,
        id: event.realId
      }));

    case 'moveStage':
      // placeInStage couples the (stage, status) pair — entering the terminal
      // (last) stage marks the candidate hired, leaving it clears a stale hired
      // back to active. Terminal is resolved from the job's stages by position.
      return mapCandidate(state, event.id, (c) => {
        const job = state.jobs.find((j) => j.id === c.jobId);
        return { ...c, ...placeInStage(event.stage, c, job?.stages ?? []) };
      });

    case 'editCandidate':
      return mapCandidate(state, event.id, (c) => ({
        ...c,
        name: event.name,
        source: event.source,
        owner: event.owner,
        linkedinUrl: event.linkedinUrl,
        githubUrl: event.githubUrl,
        yearsExperience: event.yearsExperience
      }));

    case 'setStatus':
      return mapCandidate(state, event.id, (c) => {
        const job = state.jobs.find((j) => j.id === c.jobId);
        return { ...c, ...placeWithStatus(event.status, c, job?.stages ?? []) };
      });

    case 'setCandidateStarred':
      return mapCandidate(state, event.id, (c) => ({
        ...c,
        starred: event.starred
      }));

    case 'addFeedback':
      return mapCandidate(state, event.id, (c) => ({
        ...c,
        feedback: [
          ...c.feedback,
          {
            id: event.tempId,
            byUser: event.byUser,
            rating: event.rating,
            note: event.note
          }
        ]
      }));

    case 'reconcileFeedbackId':
      // The optimistic feedback row carries a negative temp id until the server
      // returns the real one. Match by temp id across candidates (feedback is
      // nested per candidate), rebuilding only the candidate that holds it so
      // every other row keeps its identity.
      return {
        ...state,
        candidates: state.candidates.map((c) =>
          c.feedback.some((f) => f.id === event.tempId)
            ? {
                ...c,
                feedback: c.feedback.map((f) =>
                  f.id === event.tempId ? { ...f, id: event.realId } : f
                )
              }
            : c
        )
      };

    case 'renameStage': {
      const job = state.jobs.find((j) => j.id === event.jobId);
      const old = job?.stages[event.index];
      if (job === undefined || old === undefined) return state;
      const next = job.stages.map((s, i) => (i === event.index ? event.name : s));
      return {
        ...setJobStages(state, event.jobId, next),
        // Re-point candidates sitting in the renamed column.
        candidates: state.candidates.map((c) =>
          c.jobId === event.jobId && c.stage === old
            ? { ...c, stage: event.name }
            : c
        )
      };
    }

    case 'addStage': {
      const job = state.jobs.find((j) => j.id === event.jobId);
      if (!job) return state;
      const result = addStageToPipeline(job.stages, event.name);
      return setJobStages(state, event.jobId, result.ok ? result.stages : null);
    }

    case 'reorderStage': {
      const job = state.jobs.find((j) => j.id === event.jobId);
      if (!job) return state;
      const result = reorderStages(job.stages, event.index, event.dir);
      return setJobStages(state, event.jobId, result.ok ? result.stages : null);
    }

    case 'deleteStage': {
      const job = state.jobs.find((j) => j.id === event.jobId);
      if (!job) return state;
      const stage = job.stages[event.index];
      const hasCandidates = state.candidates.some(
        (c) => c.jobId === event.jobId && c.stage === stage
      );
      const result = removeStage(job.stages, event.index, hasCandidates);
      return setJobStages(state, event.jobId, result.ok ? result.stages : null);
    }

    default:
      return state;
  }
}
