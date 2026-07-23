// Barrel for the pure, framework-free hiring helpers, split by concern so each
// module stays small and focused:
//   - users       : user / source lookup and display name / initials
//   - mentions    : @-mention autocomplete + the shared message timestamp
//   - candidate   : candidate-draft normalization / validation + seniority
//   - stages      : stage-list rules and the coupled (stage, status) placement
//   - board-view  : board derivations (column contents, tallies, tabs, ratings)
//
// Re-exported here so consumers keep importing from `@/lib/hiring/helpers`
// (and, transitively, from the `@/lib/hiring` barrel) with no knowledge of the
// split. When adding a new pure rule, put it in the module it belongs to — not
// inline in `actions.ts`, `store.ts`, or a component — so it stays testable and
// shared across layers.

export * from './users';
export * from './mentions';
export * from './candidate';
export * from './stages';
export * from './board-view';

// Re-exported from primitives (the single source) so components importing from
// the `@/lib/hiring` barrel get the bound alongside the seniority helpers.
export { MAX_YEARS_EXPERIENCE } from '../model/primitives';
