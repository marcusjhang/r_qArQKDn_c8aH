// Pure rules for a job's ordered stage list and the coupled (stage, status)
// placement. These are the single source of truth shared by the board UI, the
// optimistic client store, and the server actions, so all three layers compute
// the same next-stages array and the same auto-hire coupling from one place and
// can't disagree.

import type { Status } from '../model/types';

/** Max length of a stage name (kept in sync with the DB/zod bound). */
export const MAX_STAGE_NAME = 48;

/**
 * The terminal ("hired") stage of a pipeline, defined *structurally* as the last
 * stage — not by a magic `'Hired'` name. Entering it marks a candidate `hired`
 * and leaving it clears that status, a coupling honored identically on client
 * and server (see `placeInStage` / `placeWithStatus`). Identifying it by position
 * means renaming the column can't silently break auto-hire, and it matches where
 * `addStageToPipeline` inserts. Returns undefined only for an empty pipeline.
 */
export function terminalStage(stages: string[]): string | undefined {
  return stages.length ? stages[stages.length - 1] : undefined;
}

/** Whether `stage` is the pipeline's terminal (last) stage. */
export function isTerminalStage(stages: string[], stage: string): boolean {
  return stages.length > 0 && stage === stages[stages.length - 1];
}

/**
 * Discriminated-union result of a stage-array mutation. On success it carries
 * the *next* stages array; on failure a human-readable reason. Modeling both
 * outcomes as one algebraic type (rather than a `{ ok; stages?; reason? }` bag
 * of optional fields) lets callers narrow on `.ok` and keeps the client store
 * and the server action computing the same array from the same code.
 */
export type StageMutation =
  | { ok: true; stages: string[] }
  | { ok: false; reason: string };

/**
 * Discriminated-union result of a validation guard — no payload on success,
 * a reason on failure. Replaces the old `{ ok: boolean; reason?: string }`
 * shape so `reason` only exists where it's meaningful.
 */
export type StageGuard = { ok: true } | { ok: false; reason: string };

/**
 * Single source of truth for stage-name rules (non-empty, length, and
 * case-insensitive uniqueness). Shared by the board UI, the optimistic store,
 * and the server action so the three layers can't disagree. Pass the index to
 * ignore when renaming (so a stage doesn't collide with itself).
 */
export function validateStageName(
  stages: string[],
  name: string,
  ignoreIndex = -1
): StageGuard {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'Enter a stage name.' };
  if (trimmed.length > MAX_STAGE_NAME) {
    return {
      ok: false,
      reason: `Stage name must be ${MAX_STAGE_NAME} characters or fewer.`
    };
  }
  if (
    stages.some(
      (s, i) => i !== ignoreIndex && s.toLowerCase() === trimmed.toLowerCase()
    )
  ) {
    return { ok: false, reason: 'That stage already exists.' };
  }
  return { ok: true };
}

/**
 * Pure guard for deleting a stage: only allowed when the column is empty and
 * the job would keep at least two stages. Shared by the server action and the
 * client's optimistic pre-check.
 */
export function stageDeletable(
  stages: string[],
  columnHasCandidates: boolean
): StageGuard {
  if (columnHasCandidates) {
    return {
      ok: false,
      reason: 'Move its candidates out first. The column still holds people.'
    };
  }
  if (stages.length <= 2) {
    return { ok: false, reason: 'A pipeline needs at least two stages.' };
  }
  return { ok: true };
}

/**
 * Add a stage to a pipeline: validate the name (see `validateStageName`) then
 * insert it just before the terminal (last) stage — the same position-based
 * notion of "terminal" that `placeInStage`/`placeWithStatus` use, so a new stage
 * never displaces the hired column. Returns the next stages array so the client
 * store and the server action share one insertion rule.
 */
export function addStageToPipeline(
  stages: string[],
  name: string
): StageMutation {
  const check = validateStageName(stages, name);
  if (!check.ok) return check;
  const next = [...stages];
  next.splice(next.length - 1, 0, name.trim());
  return { ok: true, stages: next };
}

/**
 * Move the stage at `index` one slot in `dir` (+1 / -1), swapping with its
 * neighbour. Fails when the target position is out of bounds. Centralizes the
 * ordering rule that was previously hand-written in both the store and the
 * server action.
 */
export function reorderStages(
  stages: string[],
  index: number,
  dir: 1 | -1
): StageMutation {
  const target = index + dir;
  if (
    index < 0 ||
    index >= stages.length ||
    target < 0 ||
    target >= stages.length
  ) {
    return { ok: false, reason: 'Cannot move the stage past the edge.' };
  }
  const next = [...stages];
  [next[index], next[target]] = [next[target], next[index]];
  return { ok: true, stages: next };
}

/**
 * Remove the stage at `index` after checking it's deletable (see
 * `stageDeletable`). Returns the next stages array so both environments apply
 * the same guard *and* the same splice.
 */
export function removeStage(
  stages: string[],
  index: number,
  columnHasCandidates: boolean
): StageMutation {
  if (stages[index] === undefined) {
    return { ok: false, reason: 'That stage no longer exists.' };
  }
  const check = stageDeletable(stages, columnHasCandidates);
  if (!check.ok) return check;
  const next = [...stages];
  next.splice(index, 1);
  return { ok: true, stages: next };
}

/**
 * Where a candidate lands: its stage and the status implied by that stage.
 * A single value for the coupled (stage, status) pair keeps the two fields
 * from being set independently and drifting out of sync.
 */
export interface Placement {
  stage: string;
  status: Status;
}

/**
 * Resolve the placement when a candidate is *moved* into `stage`. Entering the
 * terminal stage (the pipeline's last, see `isTerminalStage`) marks them
 * `hired`; leaving it clears a stale `hired` back to `active`. Otherwise the
 * status is untouched. Takes the job's `stages` so "terminal" is resolved by
 * position, not a hardcoded name.
 */
export function placeInStage(
  stage: string,
  current: Placement,
  stages: string[]
): Placement {
  if (isTerminalStage(stages, stage)) return { stage, status: 'hired' };
  if (current.status === 'hired') return { stage, status: 'active' };
  return { stage, status: current.status };
}

/**
 * Resolve the placement when a candidate's *status* is set to `status`.
 * Becoming `hired` pulls them into the terminal stage when one exists;
 * every other status leaves the stage where it is.
 */
export function placeWithStatus(
  status: Status,
  current: Placement,
  stages: string[]
): Placement {
  const terminal = terminalStage(stages);
  if (
    status === 'hired' &&
    terminal !== undefined &&
    current.stage !== terminal
  ) {
    return { stage: terminal, status };
  }
  return { stage: current.stage, status };
}
