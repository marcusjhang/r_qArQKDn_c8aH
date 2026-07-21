'use client';

// Client store for the board. State is seeded from the server (getBoardData)
// and every mutation is applied optimistically, then persisted via a server
// action. On a failed write we router.refresh() to resync from the database.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FOUNDERS } from './config';
import { stageDeletable } from './helpers';
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
    (c) => c.job === jobId && c.stage === stage
  );
  return stageDeletable(job.stages, hasCandidates);
}

export interface HiringActions {
  addCandidate: (jobId: number, name: string, source: string) => void;
  moveTo: (id: number, stage: string) => void;
  advance: (id: number, dir: 1 | -1) => void;
  setOwner: (id: number, owner: string) => void;
  setSource: (id: number, source: string) => void;
  setStatus: (id: number, status: Status) => void;
  addFeedback: (
    id: number,
    entry: { by: string; v: RatingValue; note: string }
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

  // Resync when the server sends fresh props (i.e. after router.refresh()).
  useEffect(() => {
    setState(initial);
  }, [initial]);

  const persist = useCallback(
    (fn: () => Promise<unknown>) => {
      startTransition(async () => {
        try {
          await fn();
        } catch {
          router.refresh();
        }
      });
    },
    [router]
  );

  const addCandidate = useCallback(
    (jobId: number, name: string, source: string) => {
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
              job: jobId,
              name,
              stage: job.stages[0],
              owner: FOUNDERS[0].id,
              source,
              status: 'active',
              feedback: []
            }
          ]
        };
      });
      startTransition(async () => {
        try {
          const realId = await api.addCandidate(jobId, name, source);
          if (realId != null) {
            setState((s) => ({
              ...s,
              candidates: s.candidates.map((c) =>
                c.id === temp ? { ...c, id: realId } : c
              )
            }));
          }
        } catch {
          router.refresh();
        }
      });
    },
    [router]
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
      const job = s.jobs.find((j) => j.id === c.job);
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
          const job = s.jobs.find((j) => j.id === c.job);
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
    (id: number, entry: { by: string; v: RatingValue; note: string }) => {
      const temp = tempId.current--;
      setState((s) => ({
        ...s,
        candidates: s.candidates.map((c) =>
          c.id === id
            ? { ...c, feedback: [...c.feedback, { id: temp, ...entry }] }
            : c
        )
      }));
      persist(() => api.addFeedback(id, entry.by, entry.v, entry.note));
    },
    [persist]
  );

  const renameStage = useCallback(
    (jobId: number, index: number, name: string) => {
      setState((s) => {
        const job = s.jobs.find((j) => j.id === jobId);
        if (!job) return s;
        const old = job.stages[index];
        if (!name || name === old) return s;
        return {
          ...s,
          jobs: s.jobs.map((j) =>
            j.id === jobId
              ? { ...j, stages: j.stages.map((st, i) => (i === index ? name : st)) }
              : j
          ),
          candidates: s.candidates.map((c) =>
            c.job === jobId && c.stage === old ? { ...c, stage: name } : c
          )
        };
      });
      persist(() => api.renameStage(jobId, index, name));
    },
    [persist]
  );

  const addStage = useCallback(
    (jobId: number, name: string) => {
      setState((s) => ({
        ...s,
        jobs: s.jobs.map((j) => {
          if (j.id !== jobId) return j;
          const stages = [...j.stages];
          stages.splice(stages.length - 1, 0, name);
          return { ...j, stages };
        })
      }));
      persist(() => api.addStage(jobId, name));
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
