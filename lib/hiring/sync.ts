'use client';

// Optimistic sync engine for the board: the temp-id counter, the queue that
// defers a mutation until its row reconciles to a real server id, the single
// write mutation, and the resync that rolls a failed write back. Agnostic of the
// board's shape — the store injects `invalidate`. See ADR 0001.

import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

/** The persistence unit: a server-action thunk plus an optional id reconciler. */
interface PersistArgs {
  run: () => Promise<unknown>;
  onResult?: (result: unknown) => void;
  /** Per-call failure hook, run before the shared resync (see the mutation). */
  onError?: () => void;
}

export interface OptimisticSync {
  /** Next negative temp id for an optimistic row (monotonically decreasing) until the server hands back a real one. */
  nextTempId: () => number;
  /** The single write path: runs the server action, hands a create's id to `onResult`, and resyncs on failure. Referentially stable. */
  persist: (args: PersistArgs) => void;
  /** Run `fn` with the row's real id — immediately if already real, else deferred until the temp id reconciles (a negative temp id would fail the server's positive-int guard). */
  whenReconciled: (id: number, fn: (realId: number) => void) => void;
  /** Drain the mutations queued against a temp id, replaying them with the server's real id. */
  flushPending: (tempId: number, realId: number) => void;
  /** Error recovery: drop queued mutations and refetch the authoritative board (rolls the failed write back). */
  resync: () => void;
}

/** Wire the optimistic-sync engine. `invalidate` refetches the authoritative board and should be referentially stable. */
export function useOptimisticSync(invalidate: () => void): OptimisticSync {
  // Negative ids for optimistic rows until the server hands back a real one.
  const tempId = useRef(-1);
  // Mutations queued by temp id, deferred until the row's create/add reconciles to a real id, then flushed.
  const pending = useRef(new Map<number, Array<(realId: number) => void>>());

  const nextTempId = useCallback(() => tempId.current--, []);

  const resync = useCallback(() => {
    pending.current.clear();
    invalidate();
  }, [invalidate]);

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

  const flushPending = useCallback((temp: number, realId: number) => {
    const queue = pending.current.get(temp);
    if (!queue) return;
    pending.current.delete(temp);
    for (const fn of queue) fn(realId);
  }, []);

  // The single write path (see `persist` above); `mutate` is referentially stable.
  const { mutate: persist } = useMutation({
    mutationFn: ({ run }: PersistArgs) => run(),
    onSuccess: (result, { onResult }) => onResult?.(result),
    onError: (_error, { onError }) => {
      // Let the caller react (e.g. clear a busy state) before the resync rolls the change back.
      onError?.();
      resync();
    }
  });

  return { nextTempId, persist, whenReconciled, flushPending, resync };
}
