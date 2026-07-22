'use client';

// Client store for the board. State is seeded from the server (getBoardData)
// and every mutation is applied optimistically by dispatching a pure event to
// the hiring reducer, then persisted via a server action. On a failed write we
// router.refresh() and dispatch `reset` to resync from the database.
//
// This hook is the thin imperative shell: it holds the temp-id counter, gates
// each mutation with the shared pure helpers (so a doomed change never hits the
// server), dispatches the optimistic event, and wires the server action + error
// recovery. Every state transition itself lives in ./reducer, consuming the
// same helpers as the server actions, so the optimistic projection can't drift.

import { useCallback, useEffect, useReducer, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  stageDeletable,
  validateStageName,
  addStageToPipeline,
  reorderStages,
  removeStage,
  MAX_FAVORITES
} from './helpers';
import { hiringReducer } from './reducer';
import * as api from './actions';
import type { HiringState, RatingValue, Status } from './types';

/** Pure guard used by the board's column menu before calling deleteStage. */
export function canDeleteStage(
  state: HiringState,
  jobId: number,
  index: number
): { ok: boolean; reason?: string } {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return { ok: false };
  const stage = job.stages[index];
  const hasCandidates = state.candidates.some(
    (c) => c.jobId === jobId && c.stage === stage
  );
  return stageDeletable(job.stages, hasCandidates);
}

export interface HiringActions {
  /** Create a job (with default stages); onReady fires with the new job id. */
  createJob: (title: string, onReady: (id: number) => void) => void;
  setJobStarred: (jobId: number, starred: boolean) => void;
  deleteJob: (jobId: number) => void;
  addCandidate: (
    jobId: number,
    name: string,
    source: string,
    owner: string,
    linkedinUrl: string | null,
    githubUrl: string | null
  ) => void;
  editCandidate: (
    id: number,
    name: string,
    source: string,
    owner: string,
    linkedinUrl: string | null,
    githubUrl: string | null
  ) => void;
  moveTo: (id: number, stage: string) => void;
  advance: (id: number, dir: 1 | -1) => void;
  setStatus: (id: number, status: Status) => void;
  setCandidateStarred: (id: number, starred: boolean) => void;
  addFeedback: (
    id: number,
    entry: { byUser: string; rating: RatingValue; note: string }
  ) => void;
  renameStage: (jobId: number, index: number, name: string) => void;
  addStage: (jobId: number, name: string) => void;
  reorderStage: (jobId: number, index: number, dir: 1 | -1) => void;
  deleteStage: (jobId: number, index: number) => void;
}

export function useHiringStore(initial: HiringState): {
  state: HiringState;
  actions: HiringActions;
} {
  const [state, dispatch] = useReducer(hiringReducer, initial);
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Negative ids for optimistic rows until the server hands back a real one.
  const tempId = useRef(-1);
  // Always-current snapshot for handlers that need to read before writing.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Set just before a router.refresh() we requested, so the effect below only
  // adopts server state on an explicit resync — never clobbering an in-flight
  // optimistic change during the automatic post-action refresh.
  const wantResync = useRef(false);

  // Adopt fresh server props only when we explicitly asked to resync (error
  // recovery). Optimistic local state is otherwise authoritative.
  useEffect(() => {
    if (wantResync.current) {
      wantResync.current = false;
      dispatch({ type: 'reset', state: initial });
    }
  }, [initial]);

  const resync = useCallback(() => {
    wantResync.current = true;
    router.refresh();
  }, [router]);

  const persist = useCallback(
    (fn: () => Promise<unknown>) => {
      startTransition(async () => {
        try {
          await fn();
        } catch {
          resync();
        }
      });
    },
    [resync]
  );

  const createJob = useCallback(
    (title: string, onReady: (id: number) => void) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const temp = tempId.current--;
      dispatch({ type: 'createJob', tempId: temp, title: trimmed });
      onReady(temp); // switch to the optimistic job immediately
      startTransition(async () => {
        try {
          const realId = await api.createJob(trimmed);
          if (realId != null) {
            dispatch({ type: 'reconcileJobId', tempId: temp, realId });
            onReady(realId); // re-point the board at the persisted id
          }
        } catch {
          resync();
        }
      });
    },
    [resync]
  );

  const setJobStarred = useCallback(
    (jobId: number, starred: boolean) => {
      // Enforce the favorites cap (matches the server guard).
      if (
        starred &&
        stateRef.current.jobs.filter((j) => j.starred && j.id !== jobId)
          .length >= MAX_FAVORITES
      ) {
        return;
      }
      dispatch({ type: 'setJobStarred', jobId, starred });
      persist(() => api.setJobStarred(jobId, starred));
    },
    [persist]
  );

  const deleteJob = useCallback(
    (jobId: number) => {
      dispatch({ type: 'deleteJob', jobId });
      persist(() => api.deleteJob(jobId));
    },
    [persist]
  );

  const addCandidate = useCallback(
    (
      jobId: number,
      name: string,
      source: string,
      owner: string,
      linkedinUrl: string | null,
      githubUrl: string | null
    ) => {
      const temp = tempId.current--;
      dispatch({
        type: 'addCandidate',
        tempId: temp,
        jobId,
        name,
        source,
        owner,
        linkedinUrl,
        githubUrl
      });
      startTransition(async () => {
        try {
          const realId = await api.addCandidate(
            jobId,
            name,
            source,
            owner,
            linkedinUrl,
            githubUrl
          );
          if (realId != null) {
            dispatch({ type: 'reconcileCandidateId', tempId: temp, realId });
          }
        } catch {
          resync();
        }
      });
    },
    [resync]
  );

  const editCandidate = useCallback(
    (
      id: number,
      name: string,
      source: string,
      owner: string,
      linkedinUrl: string | null,
      githubUrl: string | null
    ) => {
      dispatch({
        type: 'editCandidate',
        id,
        name,
        source,
        owner,
        linkedinUrl,
        githubUrl
      });
      persist(() =>
        api.editCandidate(id, name, source, owner, linkedinUrl, githubUrl)
      );
    },
    [persist]
  );

  const moveTo = useCallback(
    (id: number, stage: string) => {
      dispatch({ type: 'moveStage', id, stage });
      persist(() => api.moveStage(id, stage));
    },
    [persist]
  );

  const advance = useCallback(
    (id: number, dir: 1 | -1) => {
      const s = stateRef.current;
      const c = s.candidates.find((x) => x.id === id);
      if (!c) return;
      const job = s.jobs.find((j) => j.id === c.jobId);
      if (!job) return;
      const cur = job.stages.indexOf(c.stage);
      const nextIdx = Math.min(job.stages.length - 1, Math.max(0, cur + dir));
      const stage = job.stages[nextIdx];
      if (stage !== c.stage) moveTo(id, stage);
    },
    [moveTo]
  );

  const setStatus = useCallback(
    (id: number, status: Status) => {
      dispatch({ type: 'setStatus', id, status });
      persist(() => api.setStatus(id, status));
    },
    [persist]
  );

  const setCandidateStarred = useCallback(
    (id: number, starred: boolean) => {
      dispatch({ type: 'setCandidateStarred', id, starred });
      persist(() => api.setCandidateStarred(id, starred));
    },
    [persist]
  );

  const addFeedback = useCallback(
    (id: number, entry: { byUser: string; rating: RatingValue; note: string }) => {
      const temp = tempId.current--;
      dispatch({ type: 'addFeedback', id, tempId: temp, ...entry });
      persist(() =>
        api.addFeedback(id, entry.byUser, entry.rating, entry.note)
      );
    },
    [persist]
  );

  const renameStage = useCallback(
    (jobId: number, index: number, name: string) => {
      const trimmed = name.trim();
      const job = stateRef.current.jobs.find((j) => j.id === jobId);
      if (!job) return;
      const old = job.stages[index];
      if (old === undefined || trimmed === old) return;
      if (!validateStageName(job.stages, name, index).ok) return;
      dispatch({ type: 'renameStage', jobId, index, name: trimmed });
      persist(() => api.renameStage(jobId, index, trimmed));
    },
    [persist]
  );

  const addStage = useCallback(
    (jobId: number, name: string) => {
      const job = stateRef.current.jobs.find((j) => j.id === jobId);
      if (!job) return;
      // Gate on the shared rule so a rejected name never hits the server; the
      // reducer recomputes the same insertion from the same helper.
      if (!addStageToPipeline(job.stages, name).ok) return;
      const trimmed = name.trim();
      dispatch({ type: 'addStage', jobId, name: trimmed });
      persist(() => api.addStage(jobId, trimmed));
    },
    [persist]
  );

  const reorderStage = useCallback(
    (jobId: number, index: number, dir: 1 | -1) => {
      const job = stateRef.current.jobs.find((j) => j.id === jobId);
      if (!job) return;
      if (!reorderStages(job.stages, index, dir).ok) return;
      dispatch({ type: 'reorderStage', jobId, index, dir });
      persist(() => api.reorderStage(jobId, index, dir));
    },
    [persist]
  );

  const deleteStage = useCallback(
    (jobId: number, index: number) => {
      const s0 = stateRef.current;
      const job = s0.jobs.find((j) => j.id === jobId);
      if (!job) return;
      const stage = job.stages[index];
      const hasCandidates = s0.candidates.some(
        (c) => c.jobId === jobId && c.stage === stage
      );
      if (!removeStage(job.stages, index, hasCandidates).ok) return;
      dispatch({ type: 'deleteStage', jobId, index });
      persist(() => api.deleteStage(jobId, index));
    },
    [persist]
  );

  const actions: HiringActions = {
    createJob,
    setJobStarred,
    deleteJob,
    addCandidate,
    editCandidate,
    moveTo,
    advance,
    setStatus,
    setCandidateStarred,
    addFeedback,
    renameStage,
    addStage,
    reorderStage,
    deleteStage
  };

  return { state, actions };
}
