// Server actions — the single write path for the board. Each validates its
// input at runtime (zod, from ../schemas), mutates Postgres, then revalidates
// only the cache tag(s) whose rows it changed — `board:jobs`, `board:candidates`,
// or both (see ../cache and the tagged reads in ../service). Because these
// actions are the board's sole write path, per-tag invalidation keeps the Data
// Cache consistent without a cache-wide `revalidatePath('/')`. They mirror the
// store's mutation surface one-to-one so the client can call them optimistically.
// A parse failure throws → the store's resync() reverts the optimistic change.
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
