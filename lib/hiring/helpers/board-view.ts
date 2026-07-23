// Board view derivations.
//
// Pure functions that turn the raw board state into the numbers, labels and
// orderings the UI renders — column contents, per-job tallies, the rating chip,
// drawer navigation, and the job-tab layout. Kept here (rather than inline in
// the components) so the derivations are unit-testable on their own.

import { isHiddenByDefault, isTerminal } from './candidate-status';
import type { Candidate, Job, RatingValue } from '../types';

/** At most this many jobs can be favorited (pinned as inline tabs). */
export const MAX_FAVORITES = 3;

/** Find a candidate in the board by id, or null when absent / not requested. */
export function candidateById(
  candidates: Candidate[],
  id: number | null
): Candidate | null {
  if (id == null) return null;
  return candidates.find((c) => c.id === id) ?? null;
}

/** Find a job in the board by id (undefined when absent). */
export function jobById(jobs: Job[], id: number | null): Job | undefined {
  if (id == null) return undefined;
  return jobs.find((j) => j.id === id);
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
 * Round a 1–4 mean (a trait average or overall score) to the nearest whole
 * value for a colour chip, or null when there is nothing to round. Clamped into
 * the 1–4 scale defensively.
 */
export function roundedRating(average: number | null): RatingValue | null {
  if (average == null) return null;
  return Math.min(4, Math.max(1, Math.round(average))) as RatingValue;
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
