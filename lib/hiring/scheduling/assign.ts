// Rules-based "fresh panel" interviewer assignment. Deterministic — no
// Math.random — so slot feasibility, booking, and tests all agree.

import type { PanelPick } from './types';

export interface AssignParams {
  /** Eligible AND free-for-the-slot interviewer ids (already filtered). */
  freeFounders: string[];
  /** Ids who have already met this candidate (feedback + prior non-shadow panels). */
  interviewedBefore: Set<string>;
  /** Count of upcoming assigned interviews per founder, for load-balancing. */
  upcomingLoad: Record<string, number>;
  /** The candidate's accountable owner (mildly deprioritized). */
  ownerId: string | null;
  /** FOUNDERS order, for a stable deterministic tie-break. */
  foundersOrder: string[];
  panelSize: number;
}

/**
 * Lower score = better. Freshness dominates (prefer interviewers who haven't
 * met the candidate), then load balancing, then a mild owner penalty. In a
 * thin pool the freshness term is large but not infinite, so repeats are still
 * chosen when nothing fresher is free (fallback).
 */
export function scoreFounder(id: string, p: AssignParams): number {
  return (
    1000 * (p.interviewedBefore.has(id) ? 1 : 0) +
    10 * (p.upcomingLoad[id] ?? 0) +
    1 * (id === p.ownerId ? 1 : 0)
  );
}

/**
 * Suggest a panel of up to `panelSize` interviewers. The first (lowest score,
 * then earliest in FOUNDERS order) becomes the lead; the rest are interviewers.
 */
export function suggestPanel(p: AssignParams): PanelPick[] {
  const idx = (id: string) => {
    const i = p.foundersOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ranked = [...p.freeFounders].sort((a, b) => {
    const sa = scoreFounder(a, p);
    const sb = scoreFounder(b, p);
    return sa !== sb ? sa - sb : idx(a) - idx(b);
  });
  const chosen = ranked.slice(0, p.panelSize);
  return chosen.map((founderId, i) => ({
    founderId,
    role: i === 0 ? 'lead' : 'interviewer'
  }));
}

/**
 * Set of interviewers who have already met the candidate: anyone who left
 * feedback, plus non-shadow members of the candidate's prior panels.
 */
export function interviewedBeforeSet(
  feedbackByFounder: string[],
  priorPanel: { founderId: string; role: string }[]
): Set<string> {
  const set = new Set<string>(feedbackByFounder);
  for (const m of priorPanel) if (m.role !== 'shadow') set.add(m.founderId);
  return set;
}
