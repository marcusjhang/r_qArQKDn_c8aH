'use client';

// Client store for the board, backed by TanStack Query: applies each mutation optimistically via the pure reducer straight into the query cache, then persists through the sync engine (which resyncs to roll back a failed write). Cache wiring plus action definitions only; the optimistic-sync mechanics live in ./sync.

import { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  stageDeletable,
  validateStageName,
  addStageToPipeline,
  reorderStages,
  removeStage,
  MAX_FAVORITES,
  type StageGuard
} from './helpers';
import { hiringReducer, type HiringEvent } from './reducer';
import { useOptimisticSync } from './sync';
import * as api from './actions';
import { fetchBoard } from './board-query';
import { hiringKeys } from './query-keys';
import type { ImportRow } from './import';
import type { HiringState, TraitScores, Status } from './types';

/** Pure guard used by the board's column menu before calling deleteStage. */
export function canDeleteStage(
  state: HiringState,
  jobId: number,
  index: number
): StageGuard {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return { ok: false, reason: 'That job no longer exists.' };
  const stage = job.stages[index];
  const hasCandidates = state.candidates.some(
    (c) => c.jobId === jobId && c.stage === stage
  );
  return stageDeletable(job.stages, hasCandidates);
}

export interface HiringActions {
  /** Create a job (with default stages); `traits` seeds the trait list, onReady fires with the new job id. */
  createJob: (
    title: string,
    description: string,
    traits: string[],
    onReady: (id: number) => void
  ) => void;
  setJobStarred: (jobId: number, starred: boolean) => void;
  setJobDescription: (jobId: number, description: string) => void;
  setJobTraits: (jobId: number, traits: string[]) => void;
  reorderTrait: (jobId: number, index: number, dir: 1 | -1) => void;
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
  /** Save the signed-in user's feedback (one entry per candidate, upserted); `byUser` populates the optimistic row only, the server derives the author. */
  saveFeedback: (
    id: number,
    entry: { byUser: number; traitScores: TraitScores; note: string }
  ) => void;
  renameStage: (jobId: number, index: number, name: string) => void;
  addStage: (jobId: number, name: string) => void;
  reorderStage: (jobId: number, index: number, dir: 1 | -1) => void;
  deleteStage: (jobId: number, index: number) => void;
  /** Bulk-import resolved CSV rows. Not optimistic — the write can create jobs/sources too, so success resyncs from the server; onDone fires with the count, onError lets the dialog recover. */
  importCandidates: (
    rows: ImportRow[],
    onDone: (result: { inserted: number }) => void,
    onError?: () => void
  ) => void;
}

export function useHiringStore(initial: HiringState): {
  state: HiringState;
  actions: HiringActions;
} {
  const queryClient = useQueryClient();

  // Board cache seeded from server props; staleTime:Infinity + refetchOnMount:false keep the optimistic cache authoritative until an explicit resync.
  const { data } = useQuery({
    queryKey: hiringKeys.board,
    queryFn: fetchBoard,
    initialData: initial,
    staleTime: Infinity,
    refetchOnMount: false
  });
  const state = data ?? initial;

  // First server snapshot as the reducer's fallback base; never reassigned so callbacks stay stable across `initial` changes.
  const initialRef = useRef(initial);

  // Refetch the authoritative board — the resync target on a failed write.
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: hiringKeys.board }),
    [queryClient]
  );

  // The optimistic-sync engine: temp-id counter, reconcile queue, persist, resync.
  const { nextTempId, persist, whenReconciled, flushPending, resync } =
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
    (
      title: string,
      description: string,
      traits: string[],
      onReady: (id: number) => void
    ) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const cleanTraits = traits.map((t) => t.trim()).filter(Boolean);
      const temp = nextTempId();
      dispatch({
        type: 'createJob',
        tempId: temp,
        title: trimmed,
        description: description.trim(),
        traits: cleanTraits
      });
      onReady(temp); // switch to the optimistic job immediately
      persist({
        run: () => api.createJob(trimmed, description.trim(), cleanTraits),
        onResult: (realId) => {
          if (typeof realId === 'number') {
            const id = realId;
            dispatch({ type: 'reconcileJobId', tempId: temp, realId: id });
            onReady(id); // re-point the board at the persisted id
            flushPending(temp, id); // replay any edits made before reconcile
          }
        }
      });
    },
    [dispatch, persist, flushPending, nextTempId]
  );

  const setJobDescription = useCallback(
    (jobId: number, description: string) => {
      dispatch({ type: 'setJobDescription', jobId, description });
      whenReconciled(jobId, (id) =>
        persist({ run: () => api.setJobDescription(id, description) })
      );
    },
    [dispatch, persist, whenReconciled]
  );

  const setJobTraits = useCallback(
    (jobId: number, traits: string[]) => {
      const cleaned = traits.map((t) => t.trim()).filter(Boolean);
      dispatch({ type: 'setJobTraits', jobId, traits: cleaned });
      whenReconciled(jobId, (id) =>
        persist({ run: () => api.setJobTraits(id, cleaned) })
      );
    },
    [dispatch, persist, whenReconciled]
  );

  const reorderTrait = useCallback(
    (jobId: number, index: number, dir: 1 | -1) => {
      const job = snapshot().jobs.find((j) => j.id === jobId);
      if (!job) return;
      if (!reorderStages(job.traits, index, dir).ok) return;
      dispatch({ type: 'reorderTrait', jobId, index, dir });
      whenReconciled(jobId, (id) =>
        persist({ run: () => api.reorderTrait(id, index, dir) })
      );
    },
    [dispatch, persist, snapshot, whenReconciled]
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
        yearsExperience,
        // Optimistic stage-clock start; the DB default (now) is the real value.
        at: new Date()
      });
      // Defer the write until the job's temp id reconciles — else a negative temp id hits the server, gets rejected (zId positive-int), and rolls the candidate back.
      whenReconciled(jobId, (realJobId) =>
        persist({
          run: () =>
            api.addCandidate(
              realJobId,
              name,
              source,
              owner,
              linkedinUrl,
              githubUrl,
              yearsExperience
            ),
          onResult: (realId) => {
            if (typeof realId === 'number') {
              const id = realId;
              dispatch({ type: 'reconcileCandidateId', tempId: temp, realId: id });
              flushPending(temp, id); // replay any edits made before reconcile
            }
          }
        })
      );
    },
    [dispatch, persist, whenReconciled, flushPending, nextTempId]
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
      // Stamp the move time for the reducer's stage clock; the server records its own (see withStageClock).
      dispatch({ type: 'moveStage', id, stage, at: new Date() });
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
      dispatch({ type: 'setStatus', id, status, at: new Date() });
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

  const saveFeedback = useCallback(
    (
      id: number,
      entry: { byUser: number; traitScores: TraitScores; note: string }
    ) => {
      // `byUser` populates the optimistic row only; the server derives the author.
      const temp = nextTempId();
      dispatch({ type: 'saveFeedback', id, tempId: temp, ...entry });
      whenReconciled(id, (realId) =>
        persist({
          run: () => api.saveFeedback(realId, entry.note, entry.traitScores),
          onResult: (fbId) => {
            if (typeof fbId === 'number') {
              // Adopt the server's id (a no-op when an existing entry was edited in place).
              dispatch({
                type: 'reconcileFeedbackId',
                tempId: temp,
                realId: fbId
              });
            } else {
              // Server resolved without persisting (candidate gone, or all scores scoped out) — a soft failure the thrown-error path never sees, so resync to roll the entry back.
              resync();
            }
          }
        })
      );
    },
    [dispatch, persist, whenReconciled, nextTempId, resync]
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
      // Gate on the shared rule so a rejected name never hits the server.
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

  const importCandidates = useCallback(
    (
      rows: ImportRow[],
      onDone: (result: { inserted: number }) => void,
      onError?: () => void
    ) => {
      if (rows.length === 0) {
        onDone({ inserted: 0 });
        return;
      }
      // Not optimistic: the bulk write can create jobs + sources, so commit then resync to adopt the new rows (onError lets the dialog recover).
      persist({
        run: () => api.importCandidates(rows),
        onResult: (result) => {
          onDone(result as { inserted: number });
          resync();
        },
        onError
      });
    },
    [persist, resync]
  );

  const actions: HiringActions = {
    createJob,
    setJobStarred,
    setJobDescription,
    setJobTraits,
    reorderTrait,
    deleteJob,
    addCandidate,
    editCandidate,
    moveTo,
    advance,
    setStatus,
    setCandidateStarred,
    saveFeedback,
    renameStage,
    addStage,
    reorderStage,
    deleteStage,
    importCandidates
  };

  return { state, actions };
}
