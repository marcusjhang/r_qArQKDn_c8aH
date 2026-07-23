// @vitest-environment jsdom
//
// Unit coverage for the optimistic server-state-sync engine extracted from the
// store (lib/hiring/sync.ts). It is a `'use client'` hook built on TanStack
// Query's useMutation over useRef, so it needs a DOM and a QueryClientProvider —
// opted into per-file with the docblock above, matching hiring-store.test.tsx.
//
// The store's *orchestration* (gating, dispatching into the board cache, wiring
// the actions) is covered by hiring-store.test.tsx; this file exercises the
// engine in isolation: the temp-id counter, the reconcile queue (whenReconciled
// / flushPending), the persist mutation (success reconcile + error resync), and
// the resync that clears queued work and refetches via the injected invalidate.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  notifyManager
} from '@tanstack/react-query';
import { useOptimisticSync } from '@/lib/hiring/sync';

// Flush React Query's observer notifications synchronously so mutation state
// settles within the test's waitFor, mirroring hiring-store.test.tsx.
notifyManager.setScheduler((cb) => cb());

// Each hook renders under its own QueryClient. Retries off so a rejected
// mutation surfaces its error (→ onError → resync) on the first attempt.
function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } }
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'QueryWrapper';
  return Wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('useOptimisticSync', () => {
  it('hands out monotonically decreasing temp ids starting at -1', () => {
    const { result } = renderHook(() => useOptimisticSync(vi.fn()), {
      wrapper: createWrapper()
    });

    let ids: number[] = [];
    act(() => {
      ids = [
        result.current.nextTempId(),
        result.current.nextTempId(),
        result.current.nextTempId()
      ];
    });

    expect(ids).toEqual([-1, -2, -3]);
  });

  it('runs a whenReconciled callback immediately for a real (non-negative) id', () => {
    const { result } = renderHook(() => useOptimisticSync(vi.fn()), {
      wrapper: createWrapper()
    });
    const fn = vi.fn();

    act(() => {
      result.current.whenReconciled(7, fn);
    });

    expect(fn).toHaveBeenCalledWith(7);
  });

  it('defers a whenReconciled callback for a temp id until flushPending replays it', () => {
    const { result } = renderHook(() => useOptimisticSync(vi.fn()), {
      wrapper: createWrapper()
    });
    const fn = vi.fn();

    act(() => {
      result.current.whenReconciled(-2, fn);
    });
    // Still queued — the row has not reconciled to a real id yet.
    expect(fn).not.toHaveBeenCalled();

    act(() => {
      result.current.flushPending(-2, 500);
    });
    expect(fn).toHaveBeenCalledWith(500);
  });

  it('flushPending replays every callback queued against the same temp id, once', () => {
    const { result } = renderHook(() => useOptimisticSync(vi.fn()), {
      wrapper: createWrapper()
    });
    const a = vi.fn();
    const b = vi.fn();

    act(() => {
      result.current.whenReconciled(-3, a);
      result.current.whenReconciled(-3, b);
    });
    act(() => {
      result.current.flushPending(-3, 42);
      result.current.flushPending(-3, 42); // drained — second flush is a no-op
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });

  it('persist runs the write, hands the result to onResult, and does not resync on success', async () => {
    const invalidate = vi.fn();
    const { result } = renderHook(() => useOptimisticSync(invalidate), {
      wrapper: createWrapper()
    });
    const run = vi.fn().mockResolvedValue(123);
    const onResult = vi.fn();

    act(() => {
      result.current.persist({ run, onResult });
    });

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(123));
    expect(run).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('persist resyncs (invalidate) when the write rejects', async () => {
    const invalidate = vi.fn();
    const { result } = renderHook(() => useOptimisticSync(invalidate), {
      wrapper: createWrapper()
    });
    const run = vi.fn().mockRejectedValue(new Error('write failed'));

    act(() => {
      result.current.persist({ run });
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  });

  it('resync clears queued temp-id work and invalidates so a later flush is a no-op', () => {
    const invalidate = vi.fn();
    const { result } = renderHook(() => useOptimisticSync(invalidate), {
      wrapper: createWrapper()
    });
    const fn = vi.fn();

    act(() => {
      result.current.whenReconciled(-4, fn);
      result.current.resync();
    });
    expect(invalidate).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.flushPending(-4, 9); // queue was cleared by resync
    });
    expect(fn).not.toHaveBeenCalled();
  });
});
