'use client';

// In-memory store for the Hiring Pipeline Tracker with optional localStorage
// persistence. Seeds on boot when nothing is stored, so the app comes up
// populated with zero setup and no backend.

import { useCallback, useEffect, useState } from 'react';
import { FOUNDERS } from './config';
import { seedState } from './seed';
import type {
  Candidate,
  Feedback,
  HiringState,
  Job,
  Status
} from './types';

const STORAGE_KEY = 'ht.state.v1';

function loadPersisted(): HiringState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HiringState;
    if (!parsed?.jobs?.length || !Array.isArray(parsed.candidates)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Pure guard: a stage can be deleted only when empty and not the last two. */
export function canDeleteStage(
  state: HiringState,
  jobId: string,
  index: number
): { ok: boolean; reason?: string } {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return { ok: false };
  const stage = job.stages[index];
  const hasCandidates = state.candidates.some(
    (c) => c.job === jobId && c.stage === stage
  );
  if (hasCandidates) {
    return {
      ok: false,
      reason: 'Move its candidates out first — the column still holds people.'
    };
  }
  if (job.stages.length <= 2) {
    return { ok: false, reason: 'A pipeline needs at least two stages.' };
  }
  return { ok: true };
}

export interface HiringActions {
  addCandidate: (jobId: string, name: string, source: string) => void;
  moveTo: (id: number, stage: string) => void;
  advance: (id: number, dir: 1 | -1) => void;
  setOwner: (id: number, owner: string) => void;
  setSource: (id: number, source: string) => void;
  setStatus: (id: number, status: Status) => void;
  addFeedback: (id: number, entry: Feedback) => void;
  renameStage: (jobId: string, index: number, name: string) => void;
  addStage: (jobId: string, name: string) => void;
  reorderStage: (jobId: string, index: number, dir: 1 | -1) => void;
  deleteStage: (jobId: string, index: number) => void;
}

function mapJob(state: HiringState, jobId: string, fn: (j: Job) => Job): HiringState {
  return { ...state, jobs: state.jobs.map((j) => (j.id === jobId ? fn(j) : j)) };
}

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

export function useHiringStore(): { state: HiringState; actions: HiringActions } {
  const [state, setState] = useState<HiringState>(seedState);

  // Hydrate from localStorage after mount (keeps SSR output deterministic).
  useEffect(() => {
    const persisted = loadPersisted();
    if (persisted) setState(persisted);
  }, []);

  // Persist on every change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [state]);

  const addCandidate = useCallback(
    (jobId: string, name: string, source: string) => {
      setState((s) => {
        const job = s.jobs.find((j) => j.id === jobId);
        if (!job) return s;
        const candidate: Candidate = {
          id: s.nextId,
          job: jobId,
          name,
          stage: job.stages[0],
          owner: FOUNDERS[0].id,
          source,
          status: 'active',
          feedback: []
        };
        return {
          ...s,
          candidates: [...s.candidates, candidate],
          nextId: s.nextId + 1
        };
      });
    },
    []
  );

  const moveTo = useCallback((id: number, stage: string) => {
    setState((s) =>
      mapCandidate(s, id, (c) => {
        let status = c.status;
        if (stage === 'Hired') status = 'hired';
        else if (c.status === 'hired') status = 'active';
        return { ...c, stage, status };
      })
    );
  }, []);

  const advance = useCallback((id: number, dir: 1 | -1) => {
    setState((s) => {
      const c = s.candidates.find((x) => x.id === id);
      if (!c) return s;
      const job = s.jobs.find((j) => j.id === c.job);
      if (!job) return s;
      const cur = job.stages.indexOf(c.stage);
      const next = Math.min(job.stages.length - 1, Math.max(0, cur + dir));
      const stage = job.stages[next];
      return mapCandidate(s, id, (x) => {
        let status = x.status;
        if (stage === 'Hired') status = 'hired';
        else if (x.status === 'hired') status = 'active';
        return { ...x, stage, status };
      });
    });
  }, []);

  const setOwner = useCallback((id: number, owner: string) => {
    setState((s) => mapCandidate(s, id, (c) => ({ ...c, owner })));
  }, []);

  const setSource = useCallback((id: number, source: string) => {
    setState((s) => mapCandidate(s, id, (c) => ({ ...c, source })));
  }, []);

  const setStatus = useCallback((id: number, status: Status) => {
    setState((s) =>
      mapCandidate(s, id, (c) => {
        const job = s.jobs.find((j) => j.id === c.job);
        // Setting status to Hired moves the card into the Hired stage if one exists.
        const stage =
          status === 'hired' &&
          c.stage !== 'Hired' &&
          job?.stages.includes('Hired')
            ? 'Hired'
            : c.stage;
        return { ...c, status, stage };
      })
    );
  }, []);

  const addFeedback = useCallback((id: number, entry: Feedback) => {
    setState((s) =>
      mapCandidate(s, id, (c) => ({ ...c, feedback: [...c.feedback, entry] }))
    );
  }, []);

  const renameStage = useCallback((jobId: string, index: number, name: string) => {
    setState((s) => {
      const job = s.jobs.find((j) => j.id === jobId);
      if (!job) return s;
      const old = job.stages[index];
      if (!name || name === old) return s;
      const next = mapJob(s, jobId, (j) => {
        const stages = [...j.stages];
        stages[index] = name;
        return { ...j, stages };
      });
      // Keep candidates in the renamed column pointing at the new name.
      return {
        ...next,
        candidates: next.candidates.map((c) =>
          c.job === jobId && c.stage === old ? { ...c, stage: name } : c
        )
      };
    });
  }, []);

  const addStage = useCallback((jobId: string, name: string) => {
    setState((s) =>
      mapJob(s, jobId, (j) => {
        const stages = [...j.stages];
        stages.splice(stages.length - 1, 0, name); // insert before the last stage
        return { ...j, stages };
      })
    );
  }, []);

  const reorderStage = useCallback((jobId: string, index: number, dir: 1 | -1) => {
    setState((s) =>
      mapJob(s, jobId, (j) => {
        const target = index + dir;
        if (target < 0 || target >= j.stages.length) return j;
        const stages = [...j.stages];
        [stages[index], stages[target]] = [stages[target], stages[index]];
        return { ...j, stages };
      })
    );
  }, []);

  const deleteStage = useCallback((jobId: string, index: number) => {
    setState((s) => {
      if (!canDeleteStage(s, jobId, index).ok) return s;
      return mapJob(s, jobId, (j) => {
        const stages = [...j.stages];
        stages.splice(index, 1);
        return { ...j, stages };
      });
    });
  }, []);

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
