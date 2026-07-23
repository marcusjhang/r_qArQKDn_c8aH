'use client';

// Client store for the board, backed by TanStack Query.
//
// Server truth lives in the query cache (key `hiringKeys.board`), seeded from
// the server component's props via `initialData` so first paint is instant and
// no fetch fires on mount. Every mutation is applied optimistically by running
// the SAME pure event through the hiring reducer straight into the cache
// (`setQueryData`), then persisted through a server action wrapped in a single
// `useMutation`. On a failed write the mutation's `onError` resyncs — it
// invalidates the board query, which refetches the authoritative rows and
// replaces the optimistic cache (rolling the failed change back). The server
// stays authoritative; the client is only ever optimistic between a write and
// its acknowledgement.
//
// This hook is the thin imperative shell: it owns the temp-id counter, gates
// each mutation with the shared pure helpers (so a doomed change never hits the
// server), writes the optimistic projection, and wires the mutation + resync.
// Every state transition itself lives in ./reducer, consuming the same helpers
// as the server actions, so the optimistic projection can't drift from the
// server's.

import { useCallback, useRef } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  stageDeletable,
  validateStageName,
  addStageToPipeline,
  reorderStages,
  removeStage,
  MAX_FAVORITES
} from './helpers';
import { hiringReducer, type HiringEvent } from './reducer';
import * as api from './actions';
import { fetchBoard } from './board-query';
import { hiringKeys } from './query-keys';
import type { ImportRow } from './import';
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
  /**
   * Bulk-import resolved CSV rows. Not optimistic — a bulk insert can create
   * jobs and sources too, so on success we resync from the server rather than
   * projecting many temp rows into the cache. `onDone` fires with the count on
   * success; `onError` fires if the write fails (so the dialog can leave its
   * busy state and surface the failure instead of hanging).
   */
  importCandidates: (
    rows: ImportRow[],
    onDone: (result: { inserted: number }) => void,
    onError?: () => void
  ) => void;
}

/** The persistence unit: a server-action thunk plus an optional id reconciler. */
interface PersistArgs {
  run: () => Promise<unknown>;
  onResult?: (result: unknown) => void;
  /** Per-call failure hook, run before the shared resync (see the mutation). */
  onError?: () => void;
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

  // Negative ids for optimistic rows until the server hands back a real one.
  const tempId = useRef(-1);
  // First server snapshot, kept as the reducer's fallback base. Never reassigned
  // so the callbacks below stay referentially stable across `initial` changes.
  const initialRef = useRef(initial);
  // Server mutations targeting a row whose optimistic temp id hasn't reconciled
  // yet, queued by temp id. An id-targeting action fires immediately once the
  // row has a real (non-negative) id; while it's still a negative temp id the
  // mutation is deferred here and flushed with the real id when createJob /
  // addCandidate reconciliation lands. Without this, acting on a freshly
  // created row would POST a negative id, which the server's positive-int guard
  // rejects — throwing, resyncing, and dropping the just-created row.
  const pending = useRef(new Map<number, Array<(realId: number) => void>>());

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

  // Error recovery: drop anything queued against a temp id and refetch the
  // authoritative board, which replaces the optimistic cache (rolling back the
  // failed write). Replaces the old router.refresh() + wantResync effect.
  const resync = useCallback(() => {
    pending.current.clear();
    queryClient.invalidateQueries({ queryKey: hiringKeys.board });
  }, [queryClient]);

  // Run `fn` with the row's real id: immediately when `id` is already a real
  // (non-negative) id, or deferred until the temp id reconciles otherwise.
  const whenReconciled = useCallback(
    (id: number, fn: (realId: number) => void) => {
      if (id >= 0) {
        fn(id);
        return;
      }
      const queue = pending.current.get(id) ?? [];
      queue.push(fn);
      pending.current.set(id, queue);
    },
    []
  );

  // Drain the mutations queued against a temp id, replaying them with the real
  // id the server assigned. Called from createJob / addCandidate reconciliation.
  const flushPending = useCallback((temp: number, realId: number) => {
    const queue = pending.current.get(temp);
    if (!queue) return;
    pending.current.delete(temp);
    for (const fn of queue) fn(realId);
  }, []);

  // Every write goes through this one mutation: it runs the server action, hands
  // a create's returned id to `onResult` for reconciliation, and resyncs on
  // failure (which rolls the optimistic change back). `mutate` is referentially
  // stable, so it's safe in the callback deps below.
  const { mutate: persist } = useMutation({
    mutationFn: ({ run }: PersistArgs) => run(),
    onSuccess: (result, { onResult }) => onResult?.(result),
    onError: (_error, { onError }) => {
      // Let the caller react (e.g. clear a dialog's busy state) before the
      // board resyncs, which rolls the failed optimistic change back.
      onError?.();
      resync();
    }
  });

  const createJob = useCallback(
    (title: string, onReady: (id: number) => void) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const temp = tempId.current--;
      dispatch({ type: 'createJob', tempId: temp, title: trimmed });
      onReady(temp); // switch to the optimistic job immediately
      persist({
        run: () => api.createJob(trimmed),
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
    [dispatch, persist, flushPending]
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
          if (typeof realId === 'number') {
            const id = realId;
            dispatch({ type: 'reconcileCandidateId', tempId: temp, realId: id });
            flushPending(temp, id); // replay any edits made before reconcile
          }
        }
      });
    },
    [dispatch, persist, flushPending]
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
      const temp = tempId.current--;
      dispatch({ type: 'addFeedback', id, tempId: temp, ...entry });
      whenReconciled(id, (realId) =>
        persist({
          run: () => api.addFeedback(realId, entry.rating, entry.note),
          onResult: (fbId) => {
            // Adopt the server's id so the optimistic row leaves temp-id state.
            if (typeof fbId === 'number') {
              dispatch({
                type: 'reconcileFeedbackId',
                tempId: temp,
                realId: fbId
              });
            }
          }
        })
      );
    },
    [dispatch, persist, whenReconciled]
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
      // Not optimistic: the bulk write can create jobs + sources too, so we let
      // the server commit, then resync the board query to adopt the new rows.
      // On failure `onError` lets the dialog recover (the shared mutation
      // onError still resyncs to roll back).
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
    deleteStage,
    importCandidates
  };

  return { state, actions };
}
