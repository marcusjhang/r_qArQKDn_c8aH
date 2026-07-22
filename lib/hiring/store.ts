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
    source: number,
    owner: number,
    linkedinUrl: string | null,
    githubUrl: string | null,
    yearsExperience: number | null
  ) => void;
  editCandidate: (
    id: number,
    name: string,
    source: number,
    owner: number,
    linkedinUrl: string | null,
    githubUrl: string | null,
    yearsExperience: number | null
  ) => void;
  moveTo: (id: number, stage: string) => void;
  advance: (id: number, dir: 1 | -1) => void;
  setStatus: (id: number, status: Status) => void;
  setCandidateStarred: (id: number, starred: boolean) => void;
  addFeedback: (
    id: number,
    entry: { byUser: number; rating: RatingValue; note: string }
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
  // Mutations that targeted a still-optimistic (negative temp-id) row, keyed by
  // that temp id. An optimistic row carries a negative id until the server
  // hands back the real one; a server action's `zId` rejects a negative id, so
  // acting on such a row before its reconcile would throw and resync away the
  // just-created row. We queue those mutations here and flush them with the
  // real id once reconcile lands (see reconcile* below), keeping it general
  // across jobs, candidates and feedback.
  const pending = useRef(new Map<number, ((realId: number) => void)[]>());

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
    // Fresh server state replaces every optimistic row, so any queued mutation
    // targeting a temp id is moot — drop them rather than run against stale ids.
    pending.current.clear();
    router.refresh();
  }, [router]);

  // Run `fn` against a row's real id. A non-negative id is already persisted, so
  // run immediately; a negative (temp) id belongs to an unreconciled optimistic
  // row, so defer until its reconcile flushes the queue.
  const whenReconciled = useCallback(
    (id: number, fn: (realId: number) => void) => {
      if (id >= 0) {
        fn(id);
        return;
      }
      const q = pending.current.get(id);
      if (q) q.push(fn);
      else pending.current.set(id, [fn]);
    },
    []
  );

  // Drain the mutations queued against a temp id, replaying them with the real
  // id the server just returned.
  const flushPending = useCallback((tempId: number, realId: number) => {
    const q = pending.current.get(tempId);
    if (!q) return;
    pending.current.delete(tempId);
    for (const fn of q) fn(realId);
  }, []);

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
            flushPending(temp, realId); // replay any mutations queued on the temp id
          }
        } catch {
          resync();
        }
      });
    },
    [resync, flushPending]
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
      whenReconciled(jobId, (id) => persist(() => api.setJobStarred(id, starred)));
    },
    [persist, whenReconciled]
  );

  const deleteJob = useCallback(
    (jobId: number) => {
      dispatch({ type: 'deleteJob', jobId });
      whenReconciled(jobId, (id) => persist(() => api.deleteJob(id)));
    },
    [persist, whenReconciled]
  );

  const addCandidate = useCallback(
    (
      jobId: number,
      name: string,
      source: number,
      owner: number,
      linkedinUrl: string | null,
      githubUrl: string | null,
      yearsExperience: number | null
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
        githubUrl,
        yearsExperience
      });
      startTransition(async () => {
        try {
          const realId = await api.addCandidate(
            jobId,
            name,
            source,
            owner,
            linkedinUrl,
            githubUrl,
            yearsExperience
          );
          if (realId != null) {
            dispatch({ type: 'reconcileCandidateId', tempId: temp, realId });
            flushPending(temp, realId); // replay any mutations queued on the temp id
          }
        } catch {
          resync();
        }
      });
    },
    [resync, flushPending]
  );

  const editCandidate = useCallback(
    (
      id: number,
      name: string,
      source: number,
      owner: number,
      linkedinUrl: string | null,
      githubUrl: string | null,
      yearsExperience: number | null
    ) => {
      dispatch({
        type: 'editCandidate',
        id,
        name,
        source,
        owner,
        linkedinUrl,
        githubUrl,
        yearsExperience
      });
      whenReconciled(id, (realId) =>
        persist(() =>
          api.editCandidate(
            realId,
            name,
            source,
            owner,
            linkedinUrl,
            githubUrl,
            yearsExperience
          )
        )
      );
    },
    [persist, whenReconciled]
  );

  const moveTo = useCallback(
    (id: number, stage: string) => {
      dispatch({ type: 'moveStage', id, stage });
      whenReconciled(id, (realId) => persist(() => api.moveStage(realId, stage)));
    },
    [persist, whenReconciled]
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
      whenReconciled(id, (realId) => persist(() => api.setStatus(realId, status)));
    },
    [persist, whenReconciled]
  );

  const setCandidateStarred = useCallback(
    (id: number, starred: boolean) => {
      dispatch({ type: 'setCandidateStarred', id, starred });
      whenReconciled(id, (realId) =>
        persist(() => api.setCandidateStarred(realId, starred))
      );
    },
    [persist, whenReconciled]
  );

  const addFeedback = useCallback(
    (id: number, entry: { byUser: number; rating: RatingValue; note: string }) => {
      const temp = tempId.current--;
      // byUser is the current user (used only for the optimistic row's display);
      // the server derives the real author from the session, so it's not sent.
      dispatch({ type: 'addFeedback', id, tempId: temp, ...entry });
      whenReconciled(id, (realId) => {
        startTransition(async () => {
          try {
            const fbId = await api.addFeedback(realId, entry.rating, entry.note);
            if (fbId != null) {
              dispatch({ type: 'reconcileFeedbackId', tempId: temp, realId: fbId });
            }
          } catch {
            resync();
          }
        });
      });
    },
    [resync, whenReconciled]
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
      whenReconciled(jobId, (id) =>
        persist(() => api.renameStage(id, index, trimmed))
      );
    },
    [persist, whenReconciled]
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
      whenReconciled(jobId, (id) => persist(() => api.addStage(id, trimmed)));
    },
    [persist, whenReconciled]
  );

  const reorderStage = useCallback(
    (jobId: number, index: number, dir: 1 | -1) => {
      const job = stateRef.current.jobs.find((j) => j.id === jobId);
      if (!job) return;
      if (!reorderStages(job.stages, index, dir).ok) return;
      dispatch({ type: 'reorderStage', jobId, index, dir });
      whenReconciled(jobId, (id) => persist(() => api.reorderStage(id, index, dir)));
    },
    [persist, whenReconciled]
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
      whenReconciled(jobId, (id) => persist(() => api.deleteStage(id, index)));
    },
    [persist, whenReconciled]
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
