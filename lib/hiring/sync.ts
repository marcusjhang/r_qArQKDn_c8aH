'use client';

// Optimistic server-state synchronization engine for the board.
//
// This is the imperative machinery that `useHiringStore` used to inline around
// its action definitions: the temp-id counter, the queue that defers a mutation
// until its optimistic row reconciles to a real server id, the single write
// mutation, and the resync that rolls a failed write back. Pulling it out of the
// store leaves `store.ts` as the TanStack cache wiring plus plain action
// definitions, and gives this coordination one named, separately-tested home.
//
// It is deliberately agnostic of the board's shape: it knows nothing about jobs,
// candidates, or the reducer — it only coordinates temp ids, the persist
// mutation, and the reconcile queue. The store injects `invalidate` (the board
// query's invalidation) so the engine can resync without importing the query
// keys or the query client itself. See ADR 0001 for the wider evaluation.

import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

/** The persistence unit: a server-action thunk plus an optional id reconciler. */
interface PersistArgs {
  run: () => Promise<unknown>;
  onResult?: (result: unknown) => void;
}

export interface OptimisticSync {
  /**
   * Next negative temp id for an optimistic row, until the server hands back a
   * real (non-negative) one. Monotonically decreasing.
   */
  nextTempId: () => number;
  /**
   * The single write path: runs the server action, hands a create's returned id
   * to `onResult` for reconciliation, and resyncs on failure (which rolls the
   * optimistic change back). `persist` is referentially stable.
   */
  persist: (args: PersistArgs) => void;
  /**
   * Run `fn` with the row's real id: immediately when `id` is already a real
   * (non-negative) id, or deferred until the temp id reconciles otherwise.
   * Without this, a mutation targeting a freshly created row would POST a
   * negative temp id, which the server's positive-int guard rejects.
   */
  whenReconciled: (id: number, fn: (realId: number) => void) => void;
  /**
   * Drain the mutations queued against a temp id, replaying them with the real
   * id the server assigned. Called from the create/add reconciliation paths.
   */
  flushPending: (tempId: number, realId: number) => void;
  /**
   * Error recovery: drop anything queued against a temp id and refetch the
   * authoritative board (via the injected `invalidate`), which replaces the
   * optimistic cache and rolls the failed write back.
   */
  resync: () => void;
}

/**
 * Wire the optimistic-sync engine. `invalidate` refetches the authoritative
 * server snapshot (the store passes the board query's invalidation); it should
 * be referentially stable so `resync` and the persist mutation stay stable too.
 */
export function useOptimisticSync(invalidate: () => void): OptimisticSync {
  // Negative ids for optimistic rows until the server hands back a real one.
  const tempId = useRef(-1);
  // Server mutations targeting a row whose optimistic temp id hasn't reconciled
  // yet, queued by temp id. An id-targeting action fires immediately once the
  // row has a real (non-negative) id; while it's still a negative temp id the
  // mutation is deferred here and flushed with the real id when the create/add
  // reconciliation lands.
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

  // The single write path documented on `persist` above. `mutate` is
  // referentially stable, so it's safe in the store's callback deps.
  const { mutate: persist } = useMutation({
    mutationFn: ({ run }: PersistArgs) => run(),
    onSuccess: (result, { onResult }) => onResult?.(result),
    onError: () => resync()
  });

  return { nextTempId, persist, whenReconciled, flushPending, resync };
}
