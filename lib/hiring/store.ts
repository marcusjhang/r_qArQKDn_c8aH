'use client';

// Client store for the board. State is seeded from the server (getBoardData)
// and every mutation is applied optimistically, then persisted via a server
// action. On a failed write we router.refresh() to resync from the database.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { stageDeletable, validateStageName, MAX_FAVORITES } from './helpers';
import { DEFAULT_STAGES } from './config';
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
    owner: string
  ) => void;
  moveTo: (id: number, stage: string) => void;
  advance: (id: number, dir: 1 | -1) => void;
  setOwner: (id: number, owner: string) => void;
  setSource: (id: number, source: string) => void;
  setStatus: (id: number, status: Status) => void;
  addFeedback: (
    id: number,
    entry: { byFounder: string; rating: RatingValue; note: string }
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
  const [state, setState] = useState<HiringState>(initial);
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
      setState(initial);
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
      setState((s) => ({
        ...s,
        jobs: [
          ...s.jobs,
          { id: temp, title: trimmed, stages: [...DEFAULT_STAGES], starred: false }
        ]
      }));
      onReady(temp); // switch to the optimistic job immediately
      startTransition(async () => {
        try {
          const realId = await api.createJob(trimmed);
          if (realId != null) {
            setState((s) => ({
              ...s,
              jobs: s.jobs.map((j) => (j.id === temp ? { ...j, id: realId } : j))
            }));
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
      setState((s) => ({
        ...s,
        jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, starred } : j))
      }));
      persist(() => api.setJobStarred(jobId, starred));
    },
    [persist]
  );

  const deleteJob = useCallback(
    (jobId: number) => {
      setState((s) => ({
        ...s,
        jobs: s.jobs.filter((j) => j.id !== jobId),
        candidates: s.candidates.filter((c) => c.jobId !== jobId)
      }));
      persist(() => api.deleteJob(jobId));
    },
    [persist]
  );

  const addCandidate = useCallback(
    (jobId: number, name: string, source: string, owner: string) => {
      const temp = tempId.current--;
      setState((s) => {
        const job = s.jobs.find((j) => j.id === jobId);
        if (!job) return s;
        return {
          ...s,
          candidates: [
            ...s.candidates,
            {
              id: temp,
              jobId,
              name,
              stage: job.stages[0],
              owner,
              source,
              status: 'active',
              feedback: []
            }
          ]
        };
      });
      startTransition(async () => {
        try {
          const realId = await api.addCandidate(jobId, name, source, owner);
          if (realId != null) {
            setState((s) => ({
              ...s,
              candidates: s.candidates.map((c) =>
                c.id === temp ? { ...c, id: realId } : c
              )
            }));
          }
        } catch {
          resync();
        }
      });
    },
    [resync]
  );

  const moveTo = useCallback(
    (id: number, stage: string) => {
      setState((s) => ({
        ...s,
        candidates: s.candidates.map((c) => {
          if (c.id !== id) return c;
          let status: Status = c.status;
          if (stage === 'Hired') status = 'hired';
          else if (c.status === 'hired') status = 'active';
          return { ...c, stage, status };
        })
      }));
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

  const setOwner = useCallback(
    (id: number, owner: string) => {
      setState((s) => ({
        ...s,
        candidates: s.candidates.map((c) =>
          c.id === id ? { ...c, owner } : c
        )
      }));
      persist(() => api.setOwner(id, owner));
    },
    [persist]
  );

  const setSource = useCallback(
    (id: number, source: string) => {
      setState((s) => ({
        ...s,
        candidates: s.candidates.map((c) =>
          c.id === id ? { ...c, source } : c
        )
      }));
      persist(() => api.setSource(id, source));
    },
    [persist]
  );

  const setStatus = useCallback(
    (id: number, status: Status) => {
      setState((s) => ({
        ...s,
        candidates: s.candidates.map((c) => {
          if (c.id !== id) return c;
          const job = s.jobs.find((j) => j.id === c.jobId);
          const stage =
            status === 'hired' &&
            c.stage !== 'Hired' &&
            job?.stages.includes('Hired')
              ? 'Hired'
              : c.stage;
          return { ...c, status, stage };
        })
      }));
      persist(() => api.setStatus(id, status));
    },
    [persist]
  );

  const addFeedback = useCallback(
    (id: number, entry: { byFounder: string; rating: RatingValue; note: string }) => {
      const temp = tempId.current--;
      setState((s) => ({
        ...s,
        candidates: s.candidates.map((c) =>
          c.id === id
            ? { ...c, feedback: [...c.feedback, { id: temp, ...entry }] }
            : c
        )
      }));
      persist(() =>
        api.addFeedback(id, entry.byFounder, entry.rating, entry.note)
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
      setState((s) => ({
        ...s,
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? { ...j, stages: j.stages.map((st, i) => (i === index ? trimmed : st)) }
            : j
        ),
        candidates: s.candidates.map((c) =>
          c.jobId === jobId && c.stage === old ? { ...c, stage: trimmed } : c
        )
      }));
      persist(() => api.renameStage(jobId, index, trimmed));
    },
    [persist]
  );

  const addStage = useCallback(
    (jobId: number, name: string) => {
      const job = stateRef.current.jobs.find((j) => j.id === jobId);
      if (!job) return;
      if (!validateStageName(job.stages, name).ok) return;
      const trimmed = name.trim();
      setState((s) => ({
        ...s,
        jobs: s.jobs.map((j) => {
          if (j.id !== jobId) return j;
          const stages = [...j.stages];
          stages.splice(stages.length - 1, 0, trimmed);
          return { ...j, stages };
        })
      }));
      persist(() => api.addStage(jobId, trimmed));
    },
    [persist]
  );

  const reorderStage = useCallback(
    (jobId: number, index: number, dir: 1 | -1) => {
      setState((s) => ({
        ...s,
        jobs: s.jobs.map((j) => {
          if (j.id !== jobId) return j;
          const target = index + dir;
          if (target < 0 || target >= j.stages.length) return j;
          const stages = [...j.stages];
          [stages[index], stages[target]] = [stages[target], stages[index]];
          return { ...j, stages };
        })
      }));
      persist(() => api.reorderStage(jobId, index, dir));
    },
    [persist]
  );

  const deleteStage = useCallback(
    (jobId: number, index: number) => {
      if (!canDeleteStage(stateRef.current, jobId, index).ok) return;
      setState((s) => ({
        ...s,
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? { ...j, stages: j.stages.filter((_, i) => i !== index) }
            : j
        )
      }));
      persist(() => api.deleteStage(jobId, index));
    },
    [persist]
  );

  const actions: HiringActions = {
    createJob,
    setJobStarred,
    deleteJob,
    addCandidate,
    moveTo,
    advance,
    setOwner,
    setSource,
    setStatus,
    addFeedback,
    renameStage,
    addStage,
    reorderStage,
    deleteStage
  };

  return { state, actions };
}
