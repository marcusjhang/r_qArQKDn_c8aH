'use client';

// Client store for the board, backed by TanStack Query.
//
// Server truth lives in the query cache (key `hiringKeys.board`), seeded from
// the server component's props via `initialData` so first paint is instant and
// no fetch fires on mount. Every mutation is applied optimistically by running
// the SAME pure event through the hiring reducer straight into the cache
// (`setQueryData`), then persisted through the sync engine's single write
// mutation. On a failed write the engine resyncs — it invalidates the board
// query, which refetches the authoritative rows and replaces the optimistic
// cache (rolling the failed change back). The server stays authoritative; the
// client is only ever optimistic between a write and its acknowledgement.
//
// This hook is the thin imperative shell: it holds the board cache wiring and,
// for each mutation, gates on the shared pure helpers (so a doomed change never
// hits the server), writes the optimistic projection, and hands the write to
// the sync engine. The optimistic-sync mechanics themselves — the temp-id
// counter, the temp-id reconciliation queue, the persist mutation, and resync —
// live in ./sync (`useOptimisticSync`). Every state transition lives in
// ./reducer, consuming the same helpers as the server actions, so the
// optimistic projection can't drift from the server's.

import { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  stageDeletable,
  validateStageName,
  addStageToPipeline,
  reorderStages,
  removeStage,
  MAX_FAVORITES
} from './helpers';
import { hiringReducer, type HiringEvent } from './reducer';
import { useOptimisticSync } from './sync';
import * as api from './actions';
import { fetchBoard } from './board-query';
import { hiringKeys } from './query-keys';
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
  const queryClient = useQueryClient();

  // The board cache, seeded from the server props. `staleTime: Infinity` +
  // `refetchOnMount: false` keep the optimistic cache authoritative until we
  // explicitly resync — a routine re-render (or a new `initial` prop) never
  // clobbers an in-flight optimistic change; only `invalidateQueries` refetches.
  const { data } = useQuery({
    queryKey: hiringKeys.board,
    queryFn: fetchBoard,
    initialData: initial,
    staleTime: Infinity,
    refetchOnMount: false
  });
  const state = data ?? initial;

  // First server snapshot, kept as the reducer's fallback base. Never reassigned
  // so the callbacks below stay referentially stable across `initial` changes.
  const initialRef = useRef(initial);

  // Refetch the authoritative board — the resync target the sync engine calls on
  // a failed write. Stable across renders (queryClient is stable), so `resync`
  // and the persist mutation stay stable too.
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: hiringKeys.board }),
    [queryClient]
  );

  // The optimistic server-state-sync engine: temp-id counter, temp-id
  // reconciliation queue, the single persist mutation, and resync. Extracted so
  // this hook is just the cache wiring plus the action definitions.
  const { nextTempId, persist, whenReconciled, flushPending } =
    useOptimisticSync(invalidate);

  // Always-current authoritative snapshot for handlers that read before writing.
  const snapshot = useCallback(
    (): HiringState =>
      queryClient.getQueryData<HiringState>(hiringKeys.board) ??
      initialRef.current,
    [queryClient]
  );

  // Apply a pure optimistic event straight into the board cache.
  const dispatch = useCallback(
    (event: HiringEvent) => {
      queryClient.setQueryData<HiringState>(hiringKeys.board, (prev) =>
        hiringReducer(prev ?? initialRef.current, event)
      );
    },
    [queryClient]
  );

  const createJob = useCallback(
    (title: string, onReady: (id: number) => void) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const temp = nextTempId();
      dispatch({ type: 'createJob', tempId: temp, title: trimmed });
      onReady(temp); // switch to the optimistic job immediately
      persist({
        run: () => api.createJob(trimmed),
        onResult: (realId) => {
          if (realId != null) {
            const id = realId as number;
            dispatch({ type: 'reconcileJobId', tempId: temp, realId: id });
            onReady(id); // re-point the board at the persisted id
            flushPending(temp, id); // replay any edits made before reconcile
          }
        }
      });
    },
    [dispatch, persist, flushPending, nextTempId]
  );

  const setJobStarred = useCallback(
    (jobId: number, starred: boolean) => {
      // Enforce the favorites cap (matches the server guard).
      if (
        starred &&
        snapshot().jobs.filter((j) => j.starred && j.id !== jobId).length >=
          MAX_FAVORITES
      ) {
        return;
      }
      dispatch({ type: 'setJobStarred', jobId, starred });
      whenReconciled(jobId, (id) =>
        persist({ run: () => api.setJobStarred(id, starred) })
      );
    },
    [dispatch, persist, snapshot, whenReconciled]
  );

  const deleteJob = useCallback(
    (jobId: number) => {
      dispatch({ type: 'deleteJob', jobId });
      whenReconciled(jobId, (id) => persist({ run: () => api.deleteJob(id) }));
    },
    [dispatch, persist, whenReconciled]
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
      const temp = nextTempId();
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
      persist({
        run: () =>
          api.addCandidate(
            jobId,
            name,
            source,
            owner,
            linkedinUrl,
            githubUrl,
            yearsExperience
          ),
        onResult: (realId) => {
          if (realId != null) {
            const id = realId as number;
            dispatch({ type: 'reconcileCandidateId', tempId: temp, realId: id });
            flushPending(temp, id); // replay any edits made before reconcile
          }
        }
      });
    },
    [dispatch, persist, flushPending, nextTempId]
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
        persist({
          run: () =>
            api.editCandidate(
              realId,
              name,
              source,
              owner,
              linkedinUrl,
              githubUrl,
              yearsExperience
            )
        })
      );
    },
    [dispatch, persist, whenReconciled]
  );

  const moveTo = useCallback(
    (id: number, stage: string) => {
      dispatch({ type: 'moveStage', id, stage });
      whenReconciled(id, (realId) =>
        persist({ run: () => api.moveStage(realId, stage) })
      );
    },
    [dispatch, persist, whenReconciled]
  );

  const advance = useCallback(
    (id: number, dir: 1 | -1) => {
      const s = snapshot();
      const c = s.candidates.find((x) => x.id === id);
      if (!c) return;
      const job = s.jobs.find((j) => j.id === c.jobId);
      if (!job) return;
      const cur = job.stages.indexOf(c.stage);
      const nextIdx = Math.min(job.stages.length - 1, Math.max(0, cur + dir));
      const stage = job.stages[nextIdx];
      if (stage !== c.stage) moveTo(id, stage);
    },
    [snapshot, moveTo]
  );

  const setStatus = useCallback(
    (id: number, status: Status) => {
      dispatch({ type: 'setStatus', id, status });
      whenReconciled(id, (realId) =>
        persist({ run: () => api.setStatus(realId, status) })
      );
    },
    [dispatch, persist, whenReconciled]
  );

  const setCandidateStarred = useCallback(
    (id: number, starred: boolean) => {
      dispatch({ type: 'setCandidateStarred', id, starred });
      whenReconciled(id, (realId) =>
        persist({ run: () => api.setCandidateStarred(realId, starred) })
      );
    },
    [dispatch, persist, whenReconciled]
  );

  const addFeedback = useCallback(
    (id: number, entry: { byUser: number; rating: RatingValue; note: string }) => {
      // `byUser` populates the optimistic display row only — the server derives
      // the author from the session and never trusts a client-supplied one.
      const temp = nextTempId();
      dispatch({ type: 'addFeedback', id, tempId: temp, ...entry });
      whenReconciled(id, (realId) =>
        persist({
          run: () => api.addFeedback(realId, entry.rating, entry.note),
          onResult: (fbId) => {
            // Adopt the server's id so the optimistic row leaves temp-id state.
            if (fbId != null) {
              dispatch({
                type: 'reconcileFeedbackId',
                tempId: temp,
                realId: fbId as number
              });
            }
          }
        })
      );
    },
    [dispatch, persist, whenReconciled, nextTempId]
  );

  const renameStage = useCallback(
    (jobId: number, index: number, name: string) => {
      const trimmed = name.trim();
      const job = snapshot().jobs.find((j) => j.id === jobId);
      if (!job) return;
      const old = job.stages[index];
      if (old === undefined || trimmed === old) return;
      if (!validateStageName(job.stages, name, index).ok) return;
      dispatch({ type: 'renameStage', jobId, index, name: trimmed });
      whenReconciled(jobId, (id) =>
        persist({ run: () => api.renameStage(id, index, trimmed) })
      );
    },
    [dispatch, persist, snapshot, whenReconciled]
  );

  const addStage = useCallback(
    (jobId: number, name: string) => {
      const job = snapshot().jobs.find((j) => j.id === jobId);
      if (!job) return;
      // Gate on the shared rule so a rejected name never hits the server; the
      // reducer recomputes the same insertion from the same helper.
      if (!addStageToPipeline(job.stages, name).ok) return;
      const trimmed = name.trim();
      dispatch({ type: 'addStage', jobId, name: trimmed });
      whenReconciled(jobId, (id) =>
        persist({ run: () => api.addStage(id, trimmed) })
      );
    },
    [dispatch, persist, snapshot, whenReconciled]
  );

  const reorderStage = useCallback(
    (jobId: number, index: number, dir: 1 | -1) => {
      const job = snapshot().jobs.find((j) => j.id === jobId);
      if (!job) return;
      if (!reorderStages(job.stages, index, dir).ok) return;
      dispatch({ type: 'reorderStage', jobId, index, dir });
      whenReconciled(jobId, (id) =>
        persist({ run: () => api.reorderStage(id, index, dir) })
      );
    },
    [dispatch, persist, snapshot, whenReconciled]
  );

  const deleteStage = useCallback(
    (jobId: number, index: number) => {
      const s0 = snapshot();
      const job = s0.jobs.find((j) => j.id === jobId);
      if (!job) return;
      const stage = job.stages[index];
      const hasCandidates = s0.candidates.some(
        (c) => c.jobId === jobId && c.stage === stage
      );
      if (!removeStage(job.stages, index, hasCandidates).ok) return;
      dispatch({ type: 'deleteStage', jobId, index });
      whenReconciled(jobId, (id) =>
        persist({ run: () => api.deleteStage(id, index) })
      );
    },
    [dispatch, persist, snapshot, whenReconciled]
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
