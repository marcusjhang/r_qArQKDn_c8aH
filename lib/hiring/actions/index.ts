// Server actions barrel — the board's single write path (split by entity below).
// No server cache to invalidate (TanStack Query is the client's sole cache); the
// page gate never protects actions (POSTable past it), so each calls
// requireUser() first — a throw reverts the store's optimistic change.

export {
  createJob,
  setJobStarred,
  deleteJob,
  setJobDescription,
  setJobTraits,
  reorderTrait,
  recommendTraits
} from './jobs';
export {
  addCandidate,
  editCandidate,
  setCandidateStarred,
  moveStage,
  setStatus,
  importCandidates
} from './candidates';
export { saveFeedback } from './feedback';
export { addStage, renameStage, reorderStage, deleteStage } from './stages';
