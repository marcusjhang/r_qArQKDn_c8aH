// Stage-array rules for a job's pipeline (validation, add/rename/reorder/delete, and the coupled (stage, status) placement). Shared verbatim by the board UI, the optimistic store, and the server actions so they can't disagree.

import type { Status } from '../types';

/** Max length of a stage name (kept in sync with the DB/zod bound). */
export const MAX_STAGE_NAME = 48;

/** The terminal ("hired") stage, defined structurally as the last one (not a magic `'Hired'` name), so renaming the column can't break auto-hire. Undefined only for an empty pipeline. */
export function terminalStage(stages: string[]): string | undefined {
  return stages.length ? stages[stages.length - 1] : undefined;
}

/** Whether `stage` is the pipeline's terminal (last) stage. */
export function isTerminalStage(stages: string[], stage: string): boolean {
  return stages.length > 0 && stage === stages[stages.length - 1];
}

/** Result of a stage-array mutation: the next stages array on success, a human-readable reason on failure. */
export type StageMutation =
  | { ok: true; stages: string[] }
  | { ok: false; reason: string };

/** Result of a validation guard — no payload on success, a reason on failure. */
export type StageGuard = { ok: true } | { ok: false; reason: string };

/** Single source of truth for stage-name rules (non-empty, length, case-insensitive uniqueness). Pass `ignoreIndex` when renaming so a stage doesn't collide with itself. */
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

/** Guard for deleting a stage: only when the column is empty and the job keeps at least two stages. */
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

/** Add a stage: validate the name, then insert just before the terminal (last) stage so a new stage never displaces the hired column. */
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

/** Move the stage at `index` one slot in `dir` (+1 / -1), swapping with its neighbour; fails when the target is out of bounds. */
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

/** Remove the stage at `index` after checking it's deletable (see `stageDeletable`). */
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

/** Where a candidate lands: the coupled (stage, status) pair, kept as one value so the two can't drift apart. */
export interface Placement {
  stage: string;
  status: Status;
}

/** Placement when a candidate is moved into `stage`: entering the terminal stage marks `hired`, leaving it clears a stale `hired` to `active`, else status is untouched. */
export function placeInStage(
  stage: string,
  current: Placement,
  stages: string[]
): Placement {
  if (isTerminalStage(stages, stage)) return { stage, status: 'hired' };
  if (current.status === 'hired') return { stage, status: 'active' };
  return { stage, status: current.status };
}

/** Placement when a candidate's status is set to `status`: `hired` pulls them into the terminal stage (when one exists); every other status leaves the stage put. */
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
