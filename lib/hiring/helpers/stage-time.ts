// Time-in-stage: how long a candidate has sat in its current stage, whether
// that has exceeded the one universal "warn after N days" threshold, and the
// per-owner "your candidate is stalling" alerts derived from it. Every function
// takes an explicit `now` (ms since epoch) rather than reading the clock itself,
// so the rules stay pure and unit-testable — the caller supplies the clock (the
// board uses the useNow hook, which is null-until-mounted to avoid hydration
// drift).

import { isTerminal } from './candidate-status';
import type { Candidate } from '../types';

/** Whole milliseconds in a day — the unit the warn threshold is expressed in. */
export const MS_PER_DAY = 86_400_000;

/**
 * Milliseconds a candidate has been in its current stage, given `now`. Accepts
 * a Date (the DTO field), an ISO string, or an epoch-ms number so callers on
 * either side of the RSC boundary can use it. Clamped at 0 so a stageEnteredAt
 * slightly in the future (clock skew) never reads as negative. Internal — the
 * exported day/label/overdue helpers below are the public surface.
 */
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

/**
 * Whether a candidate has overstayed the universal stage-warn threshold — the
 * single rule the warning UI keys off. One threshold applies to every stage.
 * True only when BOTH hold:
 *   - the candidate is still moving through the pipeline (not terminal — a
 *     hired/rejected candidate parked in a column is done, not stalled);
 *   - the whole days in stage have reached `warnDays` ("warn after N days").
 */
export function stageOverdue(
  candidate: Candidate,
  warnDays: number,
  now: number
): boolean {
  if (isTerminal(candidate)) return false;
  return daysInStage(candidate.stageEnteredAt, now) >= warnDays;
}

/**
 * Compact human label for how long a candidate has been in its stage — "3d",
 * "5h", "12m", or "just now". Days once it's been at least a day, else hours,
 * else minutes. Shared by the card badge and the drawer footer.
 */
export function stageAgeLabel(
  stageEnteredAt: Date | string | number,
  now: number
): string {
  const ms = msInStage(stageEnteredAt, now);
  const days = Math.floor(ms / MS_PER_DAY);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h`;
  const mins = Math.floor(ms / 60_000);
  if (mins >= 1) return `${mins}m`;
  return 'just now';
}

/**
 * One overdue-candidate alert for its owner — the shape the notification bell
 * renders. Derived on the client (not stored): it exists only while the
 * candidate is overdue and vanishes the moment the owner advances it (which
 * resets the stage clock). `days` is carried so the row can state how long the
 * candidate has been sitting without recomputing.
 */
export interface StageAlert {
  candidateId: number;
  candidateName: string;
  jobId: number;
  stage: string;
  days: number;
}

/**
 * The overdue candidates OWNED by `ownerId` — the owner's "your candidate is
 * stalling" alerts. Reuses `stageOverdue` (so terminal candidates are already
 * excluded), then sorts longest-in-stage first so the most-stalled candidate
 * surfaces at the top of the inbox. Pure: the caller supplies `now` (the board's
 * useNow clock).
 */
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
