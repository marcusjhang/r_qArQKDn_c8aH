# ADR 0001 — TanStack Query for the hiring board, and where the store complexity goes

- **Status:** Accepted
- **Date:** 2026-07-23
- **Health area:** Code Complexity (55/100)
- **Decision:** TanStack Query is the board's client-state layer (adopted in
  PR #88). To address the Code-Complexity goal that motivated the evaluation,
  extract the store's remaining optimistic-sync mechanics into a focused,
  unit-tested hook (`lib/hiring/sync.ts`, `useOptimisticSync`).

## Context

An automated codebase-health analysis recommended:

> Evaluate whether TanStack Query could simplify data fetching and server-state
> synchronization, potentially replacing portions of the custom store logic.

The custom logic in question is `lib/hiring/store.ts` (the client hook),
`lib/hiring/reducer.ts` (the pure optimistic state machine), and the
`'use server'` write actions.

## Decision on TanStack Query

TanStack Query **is** the board's client-state layer, adopted in PR #88:

- `QueryClientProvider` in the root layout; server truth lives in the query
  cache keyed by `hiringKeys.board`, seeded from the Server Component's props via
  `initialData` (so first paint is instant and no fetch fires on mount).
- Optimistic updates run the **same** pure `reducer.ts` events straight into the
  cache via `setQueryData`.
- Writes go through a single `useMutation` wrapping the retained zod-validated
  `'use server'` actions (kept for Drizzle-level atomicity + the zod runtime
  guard; the board is uncached, so the actions never `revalidateTag`).
- A failed write resyncs by invalidating the board query, which refetches the
  authoritative rows (via `fetchBoard` in `board-query.ts`) and replaces the
  optimistic cache — the rollback.
- The chat thread and notification bell use `useQuery`/`useMutation` the same
  way; query keys are centralized in `query-keys.ts`.

This removed the previous hand-rolled `router.refresh()` + `wantResync` effect
and made the server the single authority with the client optimistic only between
a write and its acknowledgement.

## The remaining complexity, and this change

Adopting TanStack Query did **not** eliminate the store's hardest logic. Two
concerns are inherent to optimistic UI and are **not** provided by TanStack
Query, so they stayed hand-written inside `useHiringStore`, interleaved with all
14 action definitions:

1. **Temp-id reconciliation** — an optimistically-created row carries a negative
   temp id until the server returns the real one; a mutation targeting a
   not-yet-reconciled row must be **deferred** and replayed with the real id
   (`whenReconciled` / `flushPending`), or it would POST a negative id the
   server's positive-int guard rejects.
2. **The persist + resync unit** — the single write mutation whose `onError`
   drops queued temp-id work and invalidates the board query.

Together with the temp-id counter, that is ~60 lines of imperative machinery
sitting between the cache wiring and the action definitions — the concrete
"code that does too many things" the Code-Complexity finding points at.

**This change extracts that machinery into `useOptimisticSync`
(`lib/hiring/sync.ts`):** `nextTempId`, `whenReconciled`, `flushPending`,
`resync`, and the persist `useMutation`. The hook is agnostic of the board's
shape — it takes an injected `invalidate` (the board query's invalidation) and
knows nothing about jobs, candidates, or the reducer. `useHiringStore` keeps the
board-specific pieces (`useQuery` + `initialData`, the `setQueryData` dispatch,
and `snapshot()`), and each action now reads as: dispatch the optimistic event,
then `whenReconciled(id, (realId) => persist({ run: () => api.x(realId, ...) }))`.

## Consequences

- **Complexity:** the reconciliation/persist engine lives in one named,
  documented, independently unit-tested unit (`test/unit/hiring-sync.test.tsx`)
  instead of being threaded through the store. `store.ts` shrinks to cache
  wiring + action definitions.
- **Behavior:** unchanged. The existing `test/unit/hiring-store.test.tsx`
  orchestration suite passes untouched.
- **Architecture:** fully aligned with the TanStack Query adoption from #88 — the
  engine is built on `useMutation` and the board query's `invalidateQueries`, not
  a parallel mechanism. No new dependency.
- **Reuse:** the engine is generic enough that the chat thread's temp-id/optimistic
  needs could adopt it later; out of scope here.
