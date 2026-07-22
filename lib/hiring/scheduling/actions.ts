'use server';

// Write path + data actions for interview scheduling. Mirrors lib/hiring/
// actions.ts conventions: zod-validate input, mutate in a transaction, keep the
// candidate touchpoint projection in sync, then revalidate the board + calendar.

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { BOARD_TAGS } from '../cache';
import {
  db,
  candidates,
  interviews,
  interviewPanel,
  interviewerSettings,
  interviewerAvailability,
  availabilityExceptions
} from '@/lib/db';
import {
  FOUNDERS,
  INTERVIEW_DEFAULTS,
  COMPANY_TZ,
  SLOT_STEP_MIN,
  MIN_NOTICE_HOURS,
  BOOKING_DAYS,
  BUSINESS_DAYS,
  HOLIDAYS
} from '../config';
import {
  zId,
  zOwner,
  zInterviewType,
  zIsoInstant,
  zPanel,
  zAvailabilityWindow
} from '../schemas';
import { generateSlots, freeFoundersForSlot } from './slots';
import { suggestPanel, interviewedBeforeSet } from './assign';
import { projectCandidateTouchpoint } from './projection';
import {
  getAvailability,
  getExceptions,
  getBusyByFounder,
  getInterviewedBefore,
  getUpcomingLoad,
  getInterviewsForCandidate,
  getInterviewerIds
} from './queries';
import { notifyScheduled } from '../notifications/queries';
import type { Interval } from './intervals';
import type { InterviewWithPanel, PanelPick, Slot } from './types';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const founderIds = FOUNDERS.map((f) => f.id);

/** Re-derive the candidate's touchpoint fields from its interviews. */
async function reproject(tx: Tx, candidateId: number) {
  const cand = await tx.query.candidates.findFirst({
    where: (c, { eq: e }) => e(c.id, candidateId),
    columns: { stage: true }
  });
  if (!cand) return;
  const ivs = await tx.query.interviews.findMany({
    where: (i, { eq: e }) => e(i.candidateId, candidateId)
  });
  const proj = projectCandidateTouchpoint(ivs, cand.stage);
  await tx.update(candidates).set(proj).where(eq(candidates.id, candidateId));
}

/** Busy intervals per founder, read on a specific executor (db or tx). */
async function loadBusy(
  exec: Pick<typeof db, 'query'> | Tx,
  excludeInterviewId?: number
): Promise<Record<string, Interval[]>> {
  const rows = await exec.query.interviews.findMany({
    where: (i, { and, inArray, isNotNull }) =>
      and(inArray(i.status, ['scheduled', 'pending_booking']), isNotNull(i.startsAt)),
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
    for (const m of r.panel) (busy[m.founderId] ??= []).push(iv);
  }
  return busy;
}

async function loadCandidate(candidateId: number) {
  return db.query.candidates.findFirst({
    where: (c, { eq: e }) => e(c.id, candidateId),
    columns: { id: true, name: true, jobId: true, stage: true, owner: true }
  });
}

/** Active interviewer ids (schedulable pool) — for client filtering. */
export async function listInterviewers(): Promise<string[]> {
  return getInterviewerIds();
}

/** Mark a founder as an interviewer or not (scheduling roster; not a role). */
export async function setInterviewer(
  founderIdRaw: string,
  isInterviewerRaw: boolean
) {
  const founderId = zOwner.parse(founderIdRaw);
  const isInterviewer = z.boolean().parse(isInterviewerRaw);
  await db
    .insert(interviewerSettings)
    .values({ founderId, isInterviewer })
    .onConflictDoUpdate({
      target: interviewerSettings.founderId,
      set: { isInterviewer, updatedAt: new Date() }
    });
}

/** All of a candidate's interviews (for the drawer's scheduling panel). */
export async function listCandidateInterviews(
  candidateIdRaw: number
): Promise<InterviewWithPanel[]> {
  const candidateId = zId.parse(candidateIdRaw);
  return getInterviewsForCandidate(candidateId);
}

/** Candidate-facing bookable slots for an interview of the given type. */
export async function getSlotsForCandidate(
  candidateIdRaw: number,
  typeRaw: string
): Promise<Slot[]> {
  const candidateId = zId.parse(candidateIdRaw);
  const type = zInterviewType.parse(typeRaw);
  const cand = await loadCandidate(candidateId);
  if (!cand) return [];
  const def = INTERVIEW_DEFAULTS[type];
  const [availability, exceptions, busyByFounder, interviewers] =
    await Promise.all([
      getAvailability(),
      getExceptions(),
      getBusyByFounder(),
      getInterviewerIds()
    ]);
  return generateSlots({
    now: Date.now(),
    founders: interviewers,
    panelSize: def.panelSize,
    durationMin: def.durationMin,
    bufferMin: def.bufferMin,
    availability,
    exceptions,
    busyByFounder,
    tz: COMPANY_TZ,
    slotStepMin: SLOT_STEP_MIN,
    minNoticeHours: MIN_NOTICE_HOURS,
    bookingDays: BOOKING_DAYS,
    businessDays: BUSINESS_DAYS,
    holidays: HOLIDAYS
  });
}

/** Suggested "fresh panel" for a concrete slot; recruiter can override. */
export async function suggestPanelForSlot(
  candidateIdRaw: number,
  typeRaw: string,
  slotStartIsoRaw: string
): Promise<PanelPick[]> {
  const candidateId = zId.parse(candidateIdRaw);
  const type = zInterviewType.parse(typeRaw);
  const slotIso = zIsoInstant.parse(slotStartIsoRaw);
  const cand = await loadCandidate(candidateId);
  if (!cand) return [];
  const def = INTERVIEW_DEFAULTS[type];
  const [availability, exceptions, busyByFounder, before, upcomingLoad, interviewers] =
    await Promise.all([
      getAvailability(),
      getExceptions(),
      getBusyByFounder(),
      getInterviewedBefore(candidateId),
      getUpcomingLoad(Date.now()),
      getInterviewerIds()
    ]);
  const free = freeFoundersForSlot({
    founders: interviewers,
    startMs: new Date(slotIso).getTime(),
    durationMin: def.durationMin,
    bufferMin: def.bufferMin,
    availability,
    exceptions,
    busyByFounder,
    tz: COMPANY_TZ
  });
  return suggestPanel({
    freeFounders: free,
    interviewedBefore: interviewedBeforeSet(before.feedbackByFounder, before.priorPanel),
    upcomingLoad,
    ownerId: cand.owner,
    foundersOrder: founderIds,
    panelSize: def.panelSize
  });
}

/** Book an interview directly (recruiter flow). Serializable + re-check. */
export async function scheduleInterviewDirect(
  candidateIdRaw: number,
  args: { type: string; slotStartIso: string; panel: PanelPick[] }
): Promise<{ ok: true; interviewId: number } | { ok: false; error: string }> {
  const candidateId = zId.parse(candidateIdRaw);
  const type = zInterviewType.parse(args.type);
  const slotIso = zIsoInstant.parse(args.slotStartIso);
  const panel = zPanel.parse(args.panel);
  const cand = await loadCandidate(candidateId);
  if (!cand) return { ok: false, error: 'NOT_FOUND' };
  const interviewers = await getInterviewerIds();
  if (!panel.every((p) => interviewers.includes(p.founderId))) {
    return { ok: false, error: 'NOT_INTERVIEWER' };
  }
  const def = INTERVIEW_DEFAULTS[type];
  const startMs = new Date(slotIso).getTime();
  const endMs = startMs + def.durationMin * 60_000;
  const [availability, exceptions] = await Promise.all([
    getAvailability(),
    getExceptions()
  ]);

  try {
    const interviewId = await db.transaction(
      async (tx) => {
        const busy = await loadBusy(tx);
        const free = freeFoundersForSlot({
          founders: panel.map((p) => p.founderId),
          startMs,
          durationMin: def.durationMin,
          bufferMin: def.bufferMin,
          availability,
          exceptions,
          busyByFounder: busy,
          tz: COMPANY_TZ
        });
        if (!panel.every((p) => free.includes(p.founderId))) {
          throw new Error('SLOT_TAKEN');
        }
        const [iv] = await tx
          .insert(interviews)
          .values({
            candidateId,
            jobId: cand.jobId,
            type,
            status: 'scheduled',
            startsAt: new Date(startMs),
            endsAt: new Date(endMs),
            durationMin: def.durationMin,
            bufferMin: def.bufferMin,
            locationKind: 'video',
            stageAtBooking: cand.stage
          })
          .returning({ id: interviews.id });
        await tx.insert(interviewPanel).values(
          panel.map((p) => ({
            interviewId: iv.id,
            founderId: p.founderId,
            role: p.role
          }))
        );
        await reproject(tx, candidateId);
        return iv.id;
      },
      { isolationLevel: 'serializable' }
    );
    // Best-effort: notify the candidate's owner (never blocks the booking).
    try {
      await notifyScheduled({
        ownerId: cand.owner,
        candidateId,
        candidateName: cand.name,
        startsAt: new Date(startMs),
        interviewId
      });
    } catch {
      /* notification is non-critical */
    }
    revalidateTag(BOARD_TAGS.candidates);
    return { ok: true, interviewId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'ERROR';
    return { ok: false, error: msg === 'SLOT_TAKEN' ? 'SLOT_TAKEN' : 'ERROR' };
  }
}

async function setInterviewStatus(
  interviewIdRaw: number,
  status: 'completed' | 'no_show' | 'cancelled',
  cancelReason = ''
) {
  const id = zId.parse(interviewIdRaw);
  await db.transaction(async (tx) => {
    const [iv] = await tx
      .update(interviews)
      .set({ status, cancelReason, updatedAt: new Date() })
      .where(eq(interviews.id, id))
      .returning({ candidateId: interviews.candidateId });
    if (iv) await reproject(tx, iv.candidateId);
  });
  revalidateTag(BOARD_TAGS.candidates);
}

export async function markInterviewCompleted(interviewIdRaw: number) {
  await setInterviewStatus(interviewIdRaw, 'completed');
}

export async function markNoShow(interviewIdRaw: number) {
  await setInterviewStatus(interviewIdRaw, 'no_show');
}

export async function cancelInterview(interviewIdRaw: number, reasonRaw: string) {
  const reason = z.string().max(500).parse(reasonRaw ?? '');
  await setInterviewStatus(interviewIdRaw, 'cancelled', reason);
}

/** Replace an interviewer's entire weekly availability. */
export async function setAvailability(
  founderIdRaw: string,
  windowsRaw: unknown
) {
  const founderId = zOwner.parse(founderIdRaw);
  const windows = z.array(zAvailabilityWindow).max(50).parse(windowsRaw);
  await db.transaction(async (tx) => {
    await tx
      .delete(interviewerAvailability)
      .where(eq(interviewerAvailability.founderId, founderId));
    if (windows.length) {
      await tx.insert(interviewerAvailability).values(
        windows.map((w) => ({
          founderId,
          weekday: w.weekday,
          startMinute: w.startMinute,
          endMinute: w.endMinute
        }))
      );
    }
  });
}

export async function addException(
  founderIdRaw: string,
  args: { startsAt: string; endsAt: string; kind: string; note?: string }
) {
  const founderId = zOwner.parse(founderIdRaw);
  const startsAt = zIsoInstant.parse(args.startsAt);
  const endsAt = zIsoInstant.parse(args.endsAt);
  const kind = z.enum(['busy', 'available']).parse(args.kind);
  const note = z.string().max(200).parse(args.note ?? '');
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return;
  await db.insert(availabilityExceptions).values({
    founderId,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    kind,
    note
  });
}

export async function removeException(idRaw: number) {
  const id = zId.parse(idRaw);
  await db.delete(availabilityExceptions).where(eq(availabilityExceptions.id, id));
}
