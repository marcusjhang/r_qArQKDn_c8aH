// Time-in-stage: how long a candidate has sat in its current stage, whether it exceeds the universal warn threshold, and the per-owner stalling alerts. Every function takes an explicit `now` (ms) rather than reading the clock, so the rules stay pure.

import { isTerminal } from './candidate-status';
import type { Candidate } from '../types';

/** Whole milliseconds in a day — the unit the warn threshold is expressed in. */
export const MS_PER_DAY = 86_400_000;

/** Milliseconds in the current stage given `now` (accepts Date/ISO/epoch-ms). Clamped at 0 so future-dated clock skew never reads negative. */
function msInStage(
  stageEnteredAt: Date | string | number,
  now: number
): number {
  return Math.max(0, now - new Date(stageEnteredAt).getTime());
}

/** Whole days (floored) a candidate has been in its current stage. */
export function daysInStage(
  stageEnteredAt: Date | string | number,
  now: number
): number {
  return Math.floor(msInStage(stageEnteredAt, now) / MS_PER_DAY);
}

/** Whether a candidate has overstayed the universal warn threshold: true only when it's non-terminal AND its whole days in stage have reached `warnDays`. */
export function stageOverdue(
  candidate: Candidate,
  warnDays: number,
  now: number
): boolean {
  if (isTerminal(candidate)) return false;
  return daysInStage(candidate.stageEnteredAt, now) >= warnDays;
}

/** Compact label for time-in-stage, always in whole days — "3d", or "0d" for the same day (never hours or minutes). */
export function stageAgeLabel(
  stageEnteredAt: Date | string | number,
  now: number
): string {
  return `${daysInStage(stageEnteredAt, now)}d`;
}

/** One overdue-candidate alert for its owner (the notification-bell shape). Derived on the client, not stored — it vanishes once the owner advances the candidate (resetting the stage clock). */
export interface StageAlert {
  candidateId: number;
  candidateName: string;
  jobId: number;
  stage: string;
  days: number;
}

/** The overdue candidates OWNED by `ownerId`, longest-in-stage first (reuses `stageOverdue`, so terminal candidates are already excluded). */
export function overdueForOwner(
  candidates: Candidate[],
  warnDays: number,
  ownerId: number,
  now: number
): StageAlert[] {
  const alerts: StageAlert[] = [];
  for (const c of candidates) {
    if (c.owner !== ownerId) continue;
    if (!stageOverdue(c, warnDays, now)) continue;
    alerts.push({
      candidateId: c.id,
      candidateName: c.name,
      jobId: c.jobId,
      stage: c.stage,
      days: daysInStage(c.stageEnteredAt, now)
    });
  }
  return alerts.sort((a, b) => b.days - a.days);
}
