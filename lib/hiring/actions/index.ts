// Server actions — the single write path for the board. Each validates its
// input at runtime (zod, from ../schemas) and mutates Postgres. There is no
// server-side cache to invalidate: the board's reads are uncached (see
// ../service/reader) and TanStack Query is the sole caching layer on the client,
// so a write is reflected either by the store's optimistic update or by its
// resync refetch (fetchBoard) — never by a `revalidateTag`/`revalidatePath`.
// They mirror the store's mutation surface one-to-one so the client can call
// them optimistically. A parse failure throws → the store's resync() reverts the
// optimistic change.
//
// The middleware only gates *page* routes; Server Actions dispatch by action id
// and can be POSTed to the public /login route, so the page gate never protects
// them. Every action therefore calls requireUser() first, which throws (→ store
// rollback) when the caller is not signed in.
//
// The actions were split by entity into the sibling modules below; this barrel
// re-exports the same surface so the `@/lib/hiring/actions` import path (used by
// the store as `import * as api` and by the tests) is unchanged. Shared, non-
// action helpers live in ./support (server-only, not `'use server'`).

export { createJob, setJobStarred, deleteJob } from './jobs';
export {
  addCandidate,
  editCandidate,
  setCandidateStarred,
  moveStage,
  setStatus,
  importCandidates
} from './candidates';
export { addFeedback } from './feedback';
export { addStage, renameStage, reorderStage, deleteStage } from './stages';
