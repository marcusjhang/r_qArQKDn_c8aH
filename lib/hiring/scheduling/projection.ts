// Projects a candidate's interviews down onto the three existing touchpoint
// fields on `candidates` (scheduleStatus / scheduledAt / completedAt) so the
// kanban card chip — driven by scheduleReason() in helpers.ts — stays correct
// without any change to the board code. Called inside the same transaction as
// every interview mutation.

import type { Interview } from './types';

export interface TouchpointProjection {
  scheduleStatus: 'scheduled' | 'completed' | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
}

const CLEARED: TouchpointProjection = {
  scheduleStatus: null,
  scheduledAt: null,
  completedAt: null
};

function sortKey(i: Interview): number {
  const t = i.startsAt ?? i.createdAt;
  return new Date(t).getTime();
}

/**
 * The governing interview is the latest non-cancelled interview booked for the
 * candidate's CURRENT stage. Interviews from a stage the candidate has left do
 * not drive the chip (resetOnMove already cleared the fields on the move).
 */
export function governingInterview(
  interviews: Interview[],
  stage: string
): Interview | null {
  const relevant = interviews
    .filter((i) => i.status !== 'cancelled' && i.stageAtBooking === stage)
    .sort((a, b) => sortKey(b) - sortKey(a) || b.id - a.id);
  return relevant[0] ?? null;
}

export function projectCandidateTouchpoint(
  interviews: Interview[],
  stage: string
): TouchpointProjection {
  const gov = governingInterview(interviews, stage);
  if (!gov) return CLEARED;
  switch (gov.status) {
    case 'scheduled':
      return {
        scheduleStatus: 'scheduled',
        scheduledAt: gov.startsAt ? new Date(gov.startsAt) : null,
        completedAt: null
      };
    case 'completed':
      return {
        scheduleStatus: 'completed',
        scheduledAt: gov.startsAt ? new Date(gov.startsAt) : null,
        completedAt: new Date(gov.updatedAt)
      };
    // no_show and pending_booking leave the candidate looking unscheduled so
    // the existing "Needs scheduling" nudge re-fires.
    default:
      return CLEARED;
  }
}
