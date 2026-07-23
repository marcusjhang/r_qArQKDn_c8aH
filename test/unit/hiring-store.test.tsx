// @vitest-environment jsdom
//
// The one hook test in the unit suite. Everything else here is framework-free
// and runs in the config's default Node environment; `useHiringStore` is a
// `'use client'` hook (TanStack Query's useQuery/useMutation over useRef), so it
// needs a DOM and a QueryClientProvider. vitest 4 dropped `environmentMatchGlobs`,
// so the environment is opted into per-file with the docblock above rather than
// in vitest.config.ts — keeping every pure test in Node.
//
// The reducer and helpers are covered directly elsewhere; this file exercises
// the store's *orchestration* — the imperative shell that gates a mutation on
// the shared pure rules, applies the optimistic event to the TanStack Query
// board cache, fires the matching server action, reconciles temp ids, and
// resyncs from the server on failure. The server actions and the board queryFn
// are mocked so we assert the wiring, not the DB.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  renderHook,
  act,
  cleanup,
  waitFor
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  notifyManager
} from '@tanstack/react-query';
import { useHiringStore } from '@/lib/hiring/store';

// Flush React Query's observer notifications synchronously so an optimistic
// `setQueryData` is reflected in the hook's render within the same `act()`.
// (By default v5 batches notifications on a macrotask that `act` doesn't await,
// which is imperceptible in the real app but makes assertions racy in tests.)
notifyManager.setScheduler((cb) => cb());
import { DEFAULT_STAGES } from '@/lib/hiring/config';
import * as api from '@/lib/hiring/actions';
import { fetchBoard } from '@/lib/hiring/board-query';
import type { Candidate, HiringState } from '@/lib/hiring/types';

// Replace the whole server-actions module with spies — the store imports it as
// `import * as api from './actions'`, and this specifier resolves to the same
// file, so the store sees these mocks.
vi.mock('@/lib/hiring/actions', () => ({
  createJob: vi.fn(),
  setJobDescription: vi.fn(),
  setJobTraits: vi.fn(),
  reorderTrait: vi.fn(),
  addCandidate: vi.fn(),
  editCandidate: vi.fn(),
  setJobStarred: vi.fn(),
  setCandidateStarred: vi.fn(),
  deleteJob: vi.fn(),
  moveStage: vi.fn(),
  setStatus: vi.fn(),
  saveFeedback: vi.fn(),
  addStage: vi.fn(),
  renameStage: vi.fn(),
  reorderStage: vi.fn(),
  deleteStage: vi.fn()
}));

// The board queryFn: mocked so the resync path (invalidate → refetch) returns a
// deterministic server snapshot instead of hitting the DB.
vi.mock('@/lib/hiring/board-query', () => ({ fetchBoard: vi.fn() }));

// Each hook renders under its own QueryClient (no shared cache between tests).
// Retries off so a rejected mutation surfaces its error on the first attempt.
function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false }
    }
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'QueryWrapper';
  return Wrapper;
}

/** An externally-settled promise, to hold a server action pending mid-test. */
function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 10,
    jobId: 1,
    name: 'Ada',
    stage: 'Applied',
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

function makeState(over: Partial<HiringState> = {}): HiringState {
  return {
    jobs: [
      {
        id: 1,
        title: 'Engineer',
        stages: [...DEFAULT_STAGES],
        traits: [],
        description: null,
        starred: false
      }
    ],
    candidates: [candidate()],
    users: [],
    sources: [],
    bands: [],
    ...over
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('useHiringStore orchestration', () => {
  it('applies the optimistic update synchronously, before the server action resolves', async () => {
    // Hold the write pending so nothing can settle: the state change we observe
    // is purely the optimistic dispatch, not a server round-trip.
    const pending = defer<void>();
    vi.mocked(api.setCandidateStarred).mockReturnValue(pending.promise);

    const { result } = renderHook(() => useHiringStore(makeState()), { wrapper: createWrapper() });

    await act(async () => {
      result.current.actions.setCandidateStarred(10, true);
    });

    expect(result.current.state.candidates[0].starred).toBe(true);
    expect(api.setCandidateStarred).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve());
  });

  it('calls the matching server action once with the same arguments', async () => {
    const { result } = renderHook(() => useHiringStore(makeState()), { wrapper: createWrapper() });

    await act(async () => {
      result.current.actions.setJobStarred(1, true);
    });

    expect(api.setJobStarred).toHaveBeenCalledTimes(1);
    expect(api.setJobStarred).toHaveBeenCalledWith(1, true);
    expect(result.current.state.jobs[0].starred).toBe(true);
  });

  it('trims the title before dispatching and before the createJob action', async () => {
    vi.mocked(api.createJob).mockResolvedValue(42);
    const ready: number[] = [];

    const { result } = renderHook(() => useHiringStore(makeState()), { wrapper: createWrapper() });

    await act(async () => {
      result.current.actions.createJob('  Growth Lead  ', '', [], (id) =>
        ready.push(id)
      );
    });

    expect(api.createJob).toHaveBeenCalledWith('Growth Lead', '', []);
    expect(result.current.state.jobs.some((j) => j.title === 'Growth Lead')).toBe(
      true
    );
  });

  it('does not dispatch or hit the server for an empty createJob title', async () => {
    const ready: number[] = [];
    const { result } = renderHook(() => useHiringStore(makeState()), { wrapper: createWrapper() });

    await act(async () => {
      result.current.actions.createJob('   ', '', [], (id) => ready.push(id));
    });

    expect(api.createJob).not.toHaveBeenCalled();
    expect(ready).toEqual([]);
    expect(result.current.state.jobs).toHaveLength(1);
  });

  it('reconciles a job temp id to the server id (onReady fires with temp, then real)', async () => {
    const created = defer<number | null>();
    vi.mocked(api.createJob).mockReturnValue(created.promise);
    const ready: number[] = [];

    const { result } = renderHook(() => useHiringStore(makeState()), { wrapper: createWrapper() });

    await act(async () => {
      result.current.actions.createJob('Designer', '', [], (id) => ready.push(id));
    });

    // Optimistic row uses a negative temp id; onReady has fired once with it.
    const temp = result.current.state.jobs.find((j) => j.title === 'Designer');
    expect(temp?.id).toBeLessThan(0);
    expect(ready).toEqual([temp!.id]);

    await act(async () => created.resolve(99));

    expect(ready).toEqual([temp!.id, 99]);
    expect(result.current.state.jobs.some((j) => j.id === 99)).toBe(true);
    expect(result.current.state.jobs.some((j) => j.id === temp!.id)).toBe(false);
  });

  it('reconciles a candidate temp id to the server id', async () => {
    const created = defer<number | null>();
    vi.mocked(api.addCandidate).mockReturnValue(created.promise);

    const { result } = renderHook(() => useHiringStore(makeState()), { wrapper: createWrapper() });

    await act(async () => {
      result.current.actions.addCandidate(1, 'Bob', 5, 7, null, null, 3);
    });

    expect(api.addCandidate).toHaveBeenCalledWith(1, 'Bob', 5, 7, null, null, 3);
    const temp = result.current.state.candidates.find((c) => c.name === 'Bob');
    expect(temp?.id).toBeLessThan(0);

    await act(async () => created.resolve(555));

    expect(result.current.state.candidates.find((c) => c.name === 'Bob')?.id).toBe(
      555
    );
  });

  it('does not reconcile when the server action returns null', async () => {
    vi.mocked(api.createJob).mockResolvedValue(null);
    const ready: number[] = [];

    const { result } = renderHook(() => useHiringStore(makeState()), { wrapper: createWrapper() });

    await act(async () => {
      result.current.actions.createJob('Recruiter', '', [], (id) => ready.push(id));
    });

    const job = result.current.state.jobs.find((j) => j.title === 'Recruiter');
    expect(job?.id).toBeLessThan(0); // temp id kept
    expect(ready).toHaveLength(1); // onReady fired only for the temp id
  });

  it('gates a no-op rename on the shared pure rule before it reaches the server', async () => {
    const { result } = renderHook(() => useHiringStore(makeState()), { wrapper: createWrapper() });

    // 'Applied' → 'Applied' (whitespace only) is a no-op the pure rule rejects.
    await act(async () => {
      result.current.actions.renameStage(1, 0, '  Applied  ');
    });

    expect(api.renameStage).not.toHaveBeenCalled();
    expect(result.current.state.jobs[0].stages[0]).toBe('Applied');
  });

  it('couples stage and status when moving a candidate into Hired', async () => {
    const { result } = renderHook(() => useHiringStore(makeState()), { wrapper: createWrapper() });

    await act(async () => {
      result.current.actions.moveTo(10, 'Hired');
    });

    expect(api.moveStage).toHaveBeenCalledWith(10, 'Hired');
    const c = result.current.state.candidates[0];
    expect(c.stage).toBe('Hired');
    expect(c.status).toBe('hired');
  });

  it('resyncs from the server on a failed write, rolling back the optimistic change', async () => {
    const failing = defer<void>();
    vi.mocked(api.setStatus).mockReturnValue(failing.promise);
    // The resync refetch returns the authoritative board (candidate still active).
    vi.mocked(fetchBoard).mockResolvedValue(makeState());

    const { result } = renderHook(() => useHiringStore(makeState()), {
      wrapper: createWrapper()
    });

    await act(async () => {
      result.current.actions.setStatus(10, 'rejected');
    });
    // Optimistic change is visible while the write is in flight.
    expect(result.current.state.candidates[0].status).toBe('rejected');

    // The write rejects → the store invalidates the board query, which refetches
    // the authoritative rows and replaces the optimistic cache.
    await act(async () => failing.reject(new Error('write failed')));

    await waitFor(() =>
      expect(result.current.state.candidates[0].status).toBe('active')
    );
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it('resyncs when saveFeedback resolves null (server persisted nothing), rolling back the optimistic entry', async () => {
    // saveFeedback signals a soft rejection by *resolving* null (not throwing):
    // the candidate was gone, or every scored trait was stale and got scoped out
    // against the job's current traits. The optimistic row must still roll back.
    const settled = defer<number | null>();
    vi.mocked(api.saveFeedback).mockReturnValue(settled.promise);
    // The authoritative board has no feedback on the candidate.
    vi.mocked(fetchBoard).mockResolvedValue(makeState());

    const { result } = renderHook(() => useHiringStore(makeState()), {
      wrapper: createWrapper()
    });

    await act(async () => {
      result.current.actions.saveFeedback(10, {
        byUser: 1,
        traitScores: { 'Systems design': 4 },
        note: 'strong'
      });
    });
    // The optimistic feedback row is visible while the write is in flight.
    expect(result.current.state.candidates[0].feedback).toHaveLength(1);

    // The server resolves null — no throw, so only the null-result branch can
    // trigger the rollback. The store refetches the authoritative board (no
    // feedback), replacing the optimistic cache.
    await act(async () => settled.resolve(null));

    await waitFor(() =>
      expect(result.current.state.candidates[0].feedback).toHaveLength(0)
    );
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it('does not clobber in-flight optimistic state on a routine re-render', async () => {
    const pending = defer<void>();
    vi.mocked(api.setJobStarred).mockReturnValue(pending.promise);

    const { result, rerender } = renderHook(
      ({ init }: { init: HiringState }) => useHiringStore(init),
      { initialProps: { init: makeState() }, wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.actions.setJobStarred(1, true);
    });
    expect(result.current.state.jobs[0].starred).toBe(true);

    // A routine re-render with new props (job unstarred) arrives without a resync
    // being requested. `initialData` seeds the board cache only on first mount, so
    // it must NOT overwrite the optimistic star, and no refetch fires.
    await act(async () => {
      rerender({ init: makeState() });
    });
    expect(result.current.state.jobs[0].starred).toBe(true);
    expect(fetchBoard).not.toHaveBeenCalled();

    await act(async () => pending.resolve());
  });
});
