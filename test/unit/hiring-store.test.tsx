// @vitest-environment jsdom
//
// Tests for the client store hook (lib/hiring/store.ts). Unlike the rest of the
// unit suite — pure functions that run in the default Node environment — this
// file exercises a React hook (useHiringStore), so it opts into a jsdom
// environment via the docblock above. The per-file directive keeps every other
// unit test in Node (the vitest.config default) untouched.
//
// The store is the board's thin imperative shell: it applies each mutation
// optimistically by dispatching to the pure reducer, then persists it through a
// server action. This suite mocks the server-actions module and next/navigation
// so we can assert the orchestration in isolation:
//   - the optimistic dispatch happens synchronously (before the await resolves);
//   - the matching server action is called with the same arguments;
//   - a create returns a temp id that is reconciled to the server's real id;
//   - a rejected write triggers resync() (router.refresh + adopt server props).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// --- Mock the server actions module (the store imports `* as api`). ---
// Each is an async spy we can resolve/reject per test.
vi.mock('@/lib/hiring/actions', () => ({
  createJob: vi.fn(),
  addCandidate: vi.fn(),
  editCandidate: vi.fn(),
  setJobStarred: vi.fn(),
  deleteJob: vi.fn(),
  moveStage: vi.fn(),
  setStatus: vi.fn(),
  setCandidateStarred: vi.fn(),
  addFeedback: vi.fn(),
  renameStage: vi.fn(),
  addStage: vi.fn(),
  reorderStage: vi.fn(),
  deleteStage: vi.fn()
}));

// --- Mock next/navigation's useRouter so resync() has a refresh() to call. ---
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh })
}));

import { useHiringStore } from '@/lib/hiring/store';
import * as api from '@/lib/hiring/actions';
import type { HiringState } from '@/lib/hiring/types';

const mockApi = vi.mocked(api);

// Minimal but valid board state: one job with the default-ish stage list and a
// single candidate sitting in the first stage.
function makeState(over: Partial<HiringState> = {}): HiringState {
  return {
    jobs: [
      { id: 1, title: 'Engineer', stages: ['Applied', 'Interview', 'Hired'], starred: false }
    ],
    candidates: [
      {
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
        feedback: []
      }
    ],
    users: [{ id: 1, firstName: 'Ada', lastName: 'L', email: 'ada@example.com' }],
    sources: [{ id: 1, name: 'Referral' }],
    bands: [],
    ...over
  };
}

// Flush the microtask queue so a resolved server action's `.then` runs.
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy path: every action resolves. Create/add return a real id.
  mockApi.createJob.mockResolvedValue(999);
  mockApi.addCandidate.mockResolvedValue(500);
  for (const key of [
    'editCandidate',
    'setJobStarred',
    'deleteJob',
    'moveStage',
    'setStatus',
    'setCandidateStarred',
    'addFeedback',
    'renameStage',
    'addStage',
    'reorderStage',
    'deleteStage'
  ] as const) {
    mockApi[key].mockResolvedValue(undefined);
  }
});

describe('useHiringStore — optimistic dispatch + persist', () => {
  it('applies a simple mutation optimistically and calls the matching action', async () => {
    const { result } = renderHook(() => useHiringStore(makeState()));

    await act(async () => {
      result.current.actions.setCandidateStarred(10, true);
    });

    // Optimistic projection is visible immediately.
    expect(result.current.state.candidates[0].starred).toBe(true);
    // ...and the same change was sent to the server exactly once.
    expect(mockApi.setCandidateStarred).toHaveBeenCalledTimes(1);
    expect(mockApi.setCandidateStarred).toHaveBeenCalledWith(10, true);
    // No error, so no resync.
    expect(refresh).not.toHaveBeenCalled();
  });

  it('gates a doomed change with the shared pure rule before it hits the server', async () => {
    // Renaming to the same name is a no-op the store must not persist.
    const { result } = renderHook(() => useHiringStore(makeState()));

    await act(async () => {
      result.current.actions.renameStage(1, 0, 'Applied');
    });

    expect(mockApi.renameStage).not.toHaveBeenCalled();
  });

  it('moveTo couples stage + status and persists the move', async () => {
    const { result } = renderHook(() => useHiringStore(makeState()));

    await act(async () => {
      result.current.actions.moveTo(10, 'Hired');
    });

    const c = result.current.state.candidates[0];
    expect(c.stage).toBe('Hired');
    // Entering the Hired column marks the candidate hired (placeInStage).
    expect(c.status).toBe('hired');
    expect(mockApi.moveStage).toHaveBeenCalledWith(10, 'Hired');
  });
});

describe('useHiringStore — temp-id reconcile', () => {
  it('createJob dispatches a temp job, then reconciles to the server id', async () => {
    // Delay the server action so we can observe the optimistic temp-id state
    // before the reconcile fires. onReady's first call carries the temp id.
    let settle!: (id: number) => void;
    mockApi.createJob.mockReturnValue(
      new Promise<number>((res) => {
        settle = res;
      })
    );
    const { result } = renderHook(() => useHiringStore(makeState()));
    const onReady = vi.fn();

    await act(async () => {
      result.current.actions.createJob('  Designer  ', onReady);
    });

    // Optimistically added with a negative temp id, trimmed title.
    const optimistic = result.current.state.jobs.find((j) => j.title === 'Designer');
    expect(optimistic).toBeDefined();
    expect(optimistic!.id).toBeLessThan(0);
    // onReady fired first with the temp id, and the action got the trimmed title.
    expect(onReady).toHaveBeenNthCalledWith(1, optimistic!.id);
    expect(mockApi.createJob).toHaveBeenCalledWith('Designer');

    // Now let the server hand back the real id.
    await act(async () => {
      settle(999);
      await Promise.resolve();
    });
    await flush();

    // Temp id has been reconciled to the server's real id (999).
    const reconciled = result.current.state.jobs.find((j) => j.title === 'Designer');
    expect(reconciled!.id).toBe(999);
    expect(onReady).toHaveBeenNthCalledWith(2, 999);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('addCandidate dispatches a temp row, then reconciles to the server id', async () => {
    let settle!: (id: number) => void;
    mockApi.addCandidate.mockReturnValue(
      new Promise<number>((res) => {
        settle = res;
      })
    );
    const { result } = renderHook(() => useHiringStore(makeState()));

    await act(async () => {
      result.current.actions.addCandidate(1, 'Grace', 1, 1, null, null, 5);
    });

    const optimistic = result.current.state.candidates.find((c) => c.name === 'Grace');
    expect(optimistic).toBeDefined();
    expect(optimistic!.id).toBeLessThan(0);
    expect(optimistic!.stage).toBe('Applied'); // first stage of the job
    expect(mockApi.addCandidate).toHaveBeenCalledWith(1, 'Grace', 1, 1, null, null, 5);

    await act(async () => {
      settle(500);
      await Promise.resolve();
    });
    await flush();

    const reconciled = result.current.state.candidates.find((c) => c.name === 'Grace');
    expect(reconciled!.id).toBe(500);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not reconcile when the create action returns null', async () => {
    mockApi.createJob.mockResolvedValue(null);
    const { result } = renderHook(() => useHiringStore(makeState()));

    await act(async () => {
      result.current.actions.createJob('Ghost', vi.fn());
    });
    await flush();

    // The optimistic job keeps its temp (negative) id — nothing to reconcile to.
    const job = result.current.state.jobs.find((j) => j.title === 'Ghost');
    expect(job!.id).toBeLessThan(0);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('useHiringStore — error → resync rollback', () => {
  it('a rejected write calls router.refresh() to resync', async () => {
    mockApi.setCandidateStarred.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useHiringStore(makeState()));

    await act(async () => {
      result.current.actions.setCandidateStarred(10, true);
    });
    await flush();

    // Optimistic change was applied, but the failed persist triggers a resync.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a rejected create triggers resync', async () => {
    mockApi.createJob.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useHiringStore(makeState()));

    await act(async () => {
      result.current.actions.createJob('Doomed', vi.fn());
    });
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('resync adopts fresh server props on the next render (reset)', async () => {
    mockApi.deleteJob.mockRejectedValue(new Error('boom'));

    // Rerender-able hook: the parent re-passes `initial` after router.refresh.
    const first = makeState();
    const { result, rerender } = renderHook(
      ({ initial }) => useHiringStore(initial),
      { initialProps: { initial: first } }
    );

    await act(async () => {
      result.current.actions.deleteJob(1);
    });
    // Optimistic delete removed the job immediately.
    expect(result.current.state.jobs).toHaveLength(0);

    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);

    // Simulate the server refresh handing back fresh props (job still present).
    const server = makeState();
    await act(async () => {
      rerender({ initial: server });
    });

    // Because wantResync was set, the effect adopts the server snapshot: the
    // optimistic delete is rolled back.
    expect(result.current.state.jobs).toHaveLength(1);
    expect(result.current.state.jobs[0].id).toBe(1);
  });

  it('does NOT adopt new props when they change without a requested resync', async () => {
    // A post-action router.refresh (success path) must not clobber in-flight
    // optimistic state: the effect only adopts when wantResync was set.
    const first = makeState();
    const { result, rerender } = renderHook(
      ({ initial }) => useHiringStore(initial),
      { initialProps: { initial: first } }
    );

    await act(async () => {
      result.current.actions.setCandidateStarred(10, true);
    });
    expect(result.current.state.candidates[0].starred).toBe(true);
    await flush();

    // New server props arrive (unstarred) but no resync was requested.
    const server = makeState();
    await act(async () => {
      rerender({ initial: server });
    });

    // Optimistic state remains authoritative.
    expect(result.current.state.candidates[0].starred).toBe(true);
  });
});
