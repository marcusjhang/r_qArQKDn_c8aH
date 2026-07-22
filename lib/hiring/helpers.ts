// Pure, framework-free helpers over the hiring domain model.

import { FOUNDERS } from './config';
import type { Candidate, Founder, Job, RatingValue, Status } from './types';

export function founderById(id: string): Founder {
  return FOUNDERS.find((f) => f.id === id) ?? FOUNDERS[0];
}

/** Max length of a profile URL (kept in sync with the zProfileUrl bound). */
export const MAX_PROFILE_URL = 500;

/**
 * Client-side mirror of the server's zProfileUrl rule: a blank/whitespace value
 * is a valid "no link" (→ null); anything else must be an http(s) URL of at
 * most MAX_PROFILE_URL characters. Shared by the add- and edit-candidate forms
 * so their validation can't drift from the server action.
 */
export function normalizeProfileUrl(raw: string): {
  ok: boolean;
  value: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_PROFILE_URL || !/^https?:\/\//i.test(trimmed)) {
    return { ok: false, value: null };
  }
  try {
    new URL(trimmed);
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, value: null };
  }
}

/** Rejected and Hired are terminal — they're not part of the active pipeline. */
export function isTerminal(c: Candidate): boolean {
  return c.status === 'rejected' || c.status === 'hired';
}

/**
 * Only rejected candidates are hidden from the board by default. Hired
 * candidates stay visible in the Hired column (that's what it's for).
 */
export function isHiddenByDefault(c: Candidate): boolean {
  return c.status === 'rejected';
}

/** Aggregate rating for a candidate, or null when there is no feedback yet. */
export function agg(c: Candidate): number | null {
  if (!c.feedback.length) return null;
  return c.feedback.reduce((a, f) => a + f.rating, 0) / c.feedback.length;
}

/**
 * The candidates rendered in one column: this stage's candidates, hiding
 * rejected ones (see `isHiddenByDefault`) unless `showRejected`, with starred
 * candidates floated to the top. The sort is stable, so creation order is
 * preserved within each group. Extracted from the board so the filter+sort
 * rule is pure and unit-testable rather than inlined in the render.
 */
export function selectStageCards(
  candidates: Candidate[],
  stage: string,
  showRejected: boolean
): Candidate[] {
  return candidates
    .filter((c) => c.stage === stage && (showRejected || !isHiddenByDefault(c)))
    .sort((a, b) => Number(b.starred) - Number(a.starred));
}

/** Max length of a stage name (kept in sync with the DB/zod bound). */
export const MAX_STAGE_NAME = 48;

/** At most this many jobs can be favorited (pinned as inline tabs). */
export const MAX_FAVORITES = 3;

/**
 * The terminal pipeline stage. Entering it marks a candidate `hired` and
 * leaving it clears that status — a coupling honored identically on client and
 * server (see `placeInStage` / `placeWithStatus`). Named once here so the rule
 * isn't spelled out as a bare `'Hired'` literal in four different call sites.
 */
export const HIRED_STAGE = 'Hired';

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
      reason: 'Move its candidates out first — the column still holds people.'
    };
  }
  if (stages.length <= 2) {
    return { ok: false, reason: 'A pipeline needs at least two stages.' };
  }
  return { ok: true };
}

/**
 * Add a stage to a pipeline: validate the name (see `validateStageName`) then
 * insert it just before the terminal stage. Returns the next stages array so
 * the client store and the server action share one insertion rule.
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
 * terminal stage marks them `hired`; leaving it clears a stale `hired` back to
 * `active`. Otherwise the status is untouched.
 */
export function placeInStage(stage: string, current: Placement): Placement {
  if (stage === HIRED_STAGE) return { stage, status: 'hired' };
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
  if (
    status === 'hired' &&
    current.stage !== HIRED_STAGE &&
    stages.includes(HIRED_STAGE)
  ) {
    return { stage: HIRED_STAGE, status };
  }
  return { stage: current.stage, status };
}

/* ------------------------------------------------------------------ *
 * Board view derivations.
 *
 * Pure functions that turn the raw board state into the numbers, labels and
 * orderings the UI renders. Kept here (rather than inline in the components)
 * so the derivations are unit-testable on their own — the same reason the
 * stage/placement rules above were centralized.
 * ------------------------------------------------------------------ */

/** Count of candidates still in the active pipeline for a job (not terminal). */
export function liveCount(candidates: Candidate[], jobId: number): number {
  return candidates.filter((c) => c.jobId === jobId && !isTerminal(c)).length;
}

/** Live / hired / rejected tallies for a single job, in one pass. */
export interface JobStats {
  /** Candidates still moving through the pipeline. */
  live: number;
  /** Candidates in the terminal Hired state. */
  hired: number;
  /** Candidates in the terminal Rejected state. */
  rejected: number;
}

export function jobStats(candidates: Candidate[], jobId: number): JobStats {
  const mine = candidates.filter((c) => c.jobId === jobId);
  return {
    live: mine.filter((c) => !isTerminal(c)).length,
    hired: mine.filter((c) => c.status === 'hired').length,
    rejected: mine.filter((c) => c.status === 'rejected').length
  };
}

/**
 * The toolbar summary line under the job title, e.g.
 * "3 active candidates · 1 hired · 2 rejected hidden". The rejected tally only
 * appears while the terminal-state filter is hiding those cards.
 */
export function formatJobMeta(stats: JobStats, showRejected: boolean): string {
  const { live, hired, rejected } = stats;
  return (
    `${live} active candidate${live === 1 ? '' : 's'}` +
    (hired ? ` · ${hired} hired` : '') +
    (rejected && !showRejected ? ` · ${rejected} rejected hidden` : '')
  );
}

/** Where a candidate sits in its pipeline and which footer moves are valid. */
export interface StageNavigation {
  /** Index of the candidate's stage in its job pipeline, or -1 if unknown. */
  index: number;
  /** True when there is an earlier stage to move back to. */
  canMoveBack: boolean;
  /** True when there is a later stage to advance to. */
  canAdvance: boolean;
}

/**
 * Resolve the drawer's Advance/Back affordances from stage position, so the UI
 * never renders a dead-end button at either end of the pipeline.
 */
export function stageNavigation(
  job: Job | undefined,
  candidate: Candidate | null | undefined
): StageNavigation {
  const index = job && candidate ? job.stages.indexOf(candidate.stage) : -1;
  return {
    index,
    canMoveBack: index > 0,
    canAdvance: index >= 0 && index < (job?.stages.length ?? 0) - 1
  };
}

/**
 * Round an aggregate rating (a 1–4 mean, see `agg`) to the nearest whole rating
 * value for the summary chip, or null when there is nothing to round. Clamped
 * into the 1–4 scale defensively.
 */
export function roundedRating(average: number | null): RatingValue | null {
  if (average == null) return null;
  return Math.min(4, Math.max(1, Math.round(average))) as RatingValue;
}

/** The rating-chip value for a candidate: rounded aggregate, or null. */
export function candidateRating(c: Candidate): RatingValue | null {
  return roundedRating(agg(c));
}

/** How the job switcher lays jobs out across inline tabs and the dropdown. */
export interface JobTabLayout {
  /** All jobs, starred-first — the order used by the "all jobs" dropdown. */
  sorted: Job[];
  /** Jobs shown as inline tabs. */
  inline: Job[];
  /** Jobs tucked into the "more" dropdown. */
  overflow: Job[];
  /** How many jobs are currently favorited. */
  favCount: number;
}

/**
 * Split jobs into inline tabs and an overflow list: starred jobs first (stable,
 * since jobs already arrive oldest-first), cap the inline set to `cap`, then
 * guarantee the active job stays visible even if it would otherwise overflow.
 */
export function partitionJobTabs(
  jobs: Job[],
  activeJob: number,
  cap: number
): JobTabLayout {
  const sorted = [...jobs].sort((a, b) => Number(b.starred) - Number(a.starred));
  let inline = sorted.slice(0, cap);
  if (!inline.some((j) => j.id === activeJob)) {
    const active = jobs.find((j) => j.id === activeJob);
    if (active) inline = [...inline, active];
  }
  const inlineIds = new Set(inline.map((j) => j.id));
  const overflow = sorted.filter((j) => !inlineIds.has(j.id));
  const favCount = jobs.filter((j) => j.starred).length;
  return { sorted, inline, overflow, favCount };
}
