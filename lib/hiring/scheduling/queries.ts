import 'server-only';

// Server-side reads for the calendar + scheduling. Uses Drizzle's relational
// query API so panels/candidate/job come back already nested.

import { db } from '@/lib/db';
import { FOUNDERS } from '../config';
import type { Interval } from './intervals';
import type {
  Availability,
  AvailabilityException,
  CalendarInterview,
  InterviewWithPanel
} from './types';

/** All interviews in a UTC range (+ their panels) for the calendar grid. */
export async function getCalendarData(range?: {
  fromIso: string;
  toIso: string;
}): Promise<{
  interviews: CalendarInterview[];
  availability: Availability[];
  exceptions: AvailabilityException[];
  interviewerSettings: Record<string, boolean>;
}> {
  const rows = await db.query.interviews.findMany({
    where: (i, { and: a, ne: n, gte: g, lte: l }) =>
      range
        ? a(
            n(i.status, 'cancelled'),
            g(i.startsAt, new Date(range.fromIso)),
            l(i.startsAt, new Date(range.toIso))
          )
        : n(i.status, 'cancelled'),
    with: {
      panel: {
        columns: {
          id: true,
          interviewId: true,
          founderId: true,
          role: true,
          memberStatus: true
        }
      },
      candidate: { columns: { name: true, stage: true } },
      job: { columns: { title: true } }
    },
    orderBy: (i, { asc }) => [asc(i.startsAt), asc(i.id)]
  });

  const interviews: CalendarInterview[] = rows.map((r) => ({
    id: r.id,
    candidateId: r.candidateId,
    jobId: r.jobId,
    type: r.type,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    durationMin: r.durationMin,
    bufferMin: r.bufferMin,
    locationKind: r.locationKind,
    locationDetail: r.locationDetail,
    stageAtBooking: r.stageAtBooking,
    createdBy: r.createdBy,
    cancelReason: r.cancelReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    panel: r.panel,
    candidateName: r.candidate?.name ?? 'Unknown',
    jobTitle: r.job?.title ?? '',
    candidateStage: r.candidate?.stage ?? ''
  }));

  const [availability, exceptions, interviewerSettings] = await Promise.all([
    getAvailability(),
    getExceptions(),
    getInterviewerSettings()
  ]);
  return { interviews, availability, exceptions, interviewerSettings };
}

/**
 * Per-founder interviewer flag. A missing row defaults to true, so every
 * founder is an interviewer until explicitly turned off (scheduling only —
 * this is not a permission/role).
 */
export async function getInterviewerSettings(): Promise<Record<string, boolean>> {
  const rows = await db.query.interviewerSettings.findMany({
    columns: { founderId: true, isInterviewer: true }
  });
  const override = new Map(rows.map((r) => [r.founderId, r.isInterviewer]));
  const out: Record<string, boolean> = {};
  for (const f of FOUNDERS) out[f.id] = override.get(f.id) ?? true;
  return out;
}

/** Active interviewer founder ids (the schedulable pool). */
export async function getInterviewerIds(): Promise<string[]> {
  const settings = await getInterviewerSettings();
  return FOUNDERS.filter((f) => settings[f.id]).map((f) => f.id);
}

export async function getAvailability(): Promise<Availability[]> {
  return db.query.interviewerAvailability.findMany({
    columns: {
      id: true,
      founderId: true,
      weekday: true,
      startMinute: true,
      endMinute: true
    },
    orderBy: (a, { asc }) => [asc(a.founderId), asc(a.weekday), asc(a.startMinute)]
  });
}

export async function getExceptions(): Promise<AvailabilityException[]> {
  return db.query.availabilityExceptions.findMany({
    columns: {
      id: true,
      founderId: true,
      startsAt: true,
      endsAt: true,
      kind: true,
      note: true
    },
    orderBy: (e, { asc }) => [asc(e.startsAt)]
  });
}

/** All of a candidate's interviews (incl. cancelled, for history) + panels. */
export async function getInterviewsForCandidate(
  candidateId: number
): Promise<InterviewWithPanel[]> {
  const rows = await db.query.interviews.findMany({
    where: (i, { eq: e }) => e(i.candidateId, candidateId),
    with: {
      panel: {
        columns: {
          id: true,
          interviewId: true,
          founderId: true,
          role: true,
          memberStatus: true
        }
      }
    },
    orderBy: (i, { asc }) => [asc(i.createdAt), asc(i.id)]
  });
  return rows.map((r) => ({
    id: r.id,
    candidateId: r.candidateId,
    jobId: r.jobId,
    type: r.type,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    durationMin: r.durationMin,
    bufferMin: r.bufferMin,
    locationKind: r.locationKind,
    locationDetail: r.locationDetail,
    stageAtBooking: r.stageAtBooking,
    createdBy: r.createdBy,
    cancelReason: r.cancelReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    panel: r.panel
  }));
}

/**
 * Busy intervals per founder from all currently-holding interviews (scheduled
 * or pending with a time). Used by slot generation + panel suggestion.
 */
export async function getBusyByFounder(
  excludeInterviewId?: number,
  // Accepts a transaction executor so the booking re-check reads busy times
  // through the same code that generated the offered slots (no divergence).
  exec: Pick<typeof db, 'query'> = db
): Promise<Record<string, Interval[]>> {
  const rows = await exec.query.interviews.findMany({
    where: (i, { and: a, inArray, isNotNull }) =>
      a(inArray(i.status, ['scheduled', 'pending_booking']), isNotNull(i.startsAt)),
    with: { panel: { columns: { founderId: true } } }
  });
  const busy: Record<string, Interval[]> = {};
  for (const r of rows) {
    if (excludeInterviewId && r.id === excludeInterviewId) continue;
    if (!r.startsAt || !r.endsAt) continue;
    const iv: Interval = {
      start: new Date(r.startsAt).getTime(),
      end: new Date(r.endsAt).getTime()
    };
    for (const m of r.panel) {
      (busy[m.founderId] ??= []).push(iv);
    }
  }
  return busy;
}

/** Founder ids who have already met the candidate (feedback + prior panels). */
export async function getInterviewedBefore(
  candidateId: number
): Promise<{ feedbackByFounder: string[]; priorPanel: { founderId: string; role: string }[] }> {
  const [fb, panelRows] = await Promise.all([
    db.query.feedback.findMany({
      where: (f, { eq: e }) => e(f.candidateId, candidateId),
      columns: { byFounder: true }
    }),
    db.query.interviews.findMany({
      where: (i, { and: a, eq: e, ne: n }) =>
        a(e(i.candidateId, candidateId), n(i.status, 'cancelled')),
      with: { panel: { columns: { founderId: true, role: true } } }
    })
  ]);
  return {
    feedbackByFounder: fb.map((f) => f.byFounder),
    priorPanel: panelRows.flatMap((r) => r.panel)
  };
}

/** Count of upcoming (future, scheduled) panel memberships per founder. */
export async function getUpcomingLoad(
  nowMs: number
): Promise<Record<string, number>> {
  const rows = await db.query.interviews.findMany({
    where: (i, { and: a, eq: e, gte: g }) =>
      a(e(i.status, 'scheduled'), g(i.startsAt, new Date(nowMs))),
    with: { panel: { columns: { founderId: true } } }
  });
  const load: Record<string, number> = {};
  for (const r of rows) {
    for (const m of r.panel) load[m.founderId] = (load[m.founderId] ?? 0) + 1;
  }
  return load;
}
