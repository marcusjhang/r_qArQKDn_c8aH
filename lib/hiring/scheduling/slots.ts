// Bookable-slot generation. Pure: given each eligible interviewer's weekly
// availability, one-off exceptions, and existing busy intervals, produce the
// candidate-facing slots where a panel of `panelSize` free interviewers can be
// formed. See lib/hiring/scheduling/tz.ts for the DST-correct time math.

import { businessDaysFrom, utcToYmd, weekdayOfYmd, zonedWallClockToUtc } from './tz';
import { type Interval, merge, pad, subtract, withinAny } from './intervals';
import type { Availability, AvailabilityException, Slot } from './types';

const MIN_MS = 60_000;

export interface GenerateSlotsParams {
  now: number; // epoch ms
  founders: string[]; // eligible interviewer ids
  panelSize: number;
  durationMin: number;
  bufferMin: number;
  availability: Availability[]; // rows for the eligible founders
  exceptions: AvailabilityException[]; // rows for the eligible founders
  busyByFounder: Record<string, Interval[]>; // existing interview busy (raw start..end)
  tz: string;
  slotStepMin: number;
  minNoticeHours: number;
  bookingDays: number;
  businessDays: number[];
  holidays: string[];
}

export interface FreeIntervalsOpts {
  founderId: string;
  ymd: string;
  weekday: number;
  availability: Availability[];
  exceptions: AvailabilityException[];
  busy: Interval[]; // this founder's raw busy intervals (start..end)
  bufferMin: number;
  tz: string;
}

/**
 * A founder's free intervals for one local date: availability windows (+ one-
 * off 'available' exceptions) minus busy interviews (buffer-padded) and 'busy'
 * exceptions.
 */
export function founderFreeIntervals(o: FreeIntervalsOpts): Interval[] {
  const windows = o.availability
    .filter((a) => a.founderId === o.founderId && a.weekday === o.weekday)
    .map<Interval>((a) => ({
      start: zonedWallClockToUtc(o.ymd, a.startMinute, o.tz).getTime(),
      end: zonedWallClockToUtc(o.ymd, a.endMinute, o.tz).getTime()
    }));

  const extraAvail = o.exceptions
    .filter((e) => e.founderId === o.founderId && e.kind === 'available')
    .map<Interval>((e) => ({
      start: new Date(e.startsAt).getTime(),
      end: new Date(e.endsAt).getTime()
    }));

  const base = merge([...windows, ...extraAvail]);
  if (base.length === 0) return [];

  const busy = pad(o.busy, o.bufferMin * MIN_MS);
  const busyExceptions = o.exceptions
    .filter((e) => e.founderId === o.founderId && e.kind === 'busy')
    .map<Interval>((e) => ({
      start: new Date(e.startsAt).getTime(),
      end: new Date(e.endsAt).getTime()
    }));

  return subtract(base, [...busy, ...busyExceptions]);
}

export function generateSlots(p: GenerateSlotsParams): Slot[] {
  const earliest = p.now + p.minNoticeHours * 60 * MIN_MS;
  const dates = businessDaysFrom(
    new Date(p.now),
    p.bookingDays,
    p.tz,
    p.businessDays,
    p.holidays
  );
  const stepMs = p.slotStepMin * MIN_MS;
  const durMs = p.durationMin * MIN_MS;
  const needMs = (p.durationMin + p.bufferMin) * MIN_MS;
  const slots: Slot[] = [];

  for (const ymd of dates) {
    const weekday = weekdayOfYmd(ymd);
    // Each founder's free intervals for this date.
    const freeByFounder: Record<string, Interval[]> = {};
    for (const f of p.founders) {
      freeByFounder[f] = founderFreeIntervals({
        founderId: f,
        ymd,
        weekday,
        availability: p.availability,
        exceptions: p.exceptions,
        busy: p.busyByFounder[f] ?? [],
        bufferMin: p.bufferMin,
        tz: p.tz
      });
    }
    // Candidate grid spans the union of all founders' free intervals.
    const dayUnion = merge(p.founders.flatMap((f) => freeByFounder[f]));
    for (const span of dayUnion) {
      // Align the first grid start to the step boundary within the span.
      let s = Math.ceil(span.start / stepMs) * stepMs;
      for (; s + durMs <= span.end; s += stepMs) {
        if (s < earliest) continue;
        const end = s + durMs;
        let freeCount = 0;
        for (const f of p.founders) {
          if (withinAny(freeByFounder[f], s, s + needMs)) freeCount++;
        }
        if (freeCount >= p.panelSize) {
          slots.push({
            startIso: new Date(s).toISOString(),
            endIso: new Date(end).toISOString(),
            freeCount
          });
        }
      }
    }
  }

  // De-dup (overlapping founder spans can propose the same start) and sort.
  const byStart = new Map<string, Slot>();
  for (const sl of slots) {
    if (!byStart.has(sl.startIso)) byStart.set(sl.startIso, sl);
  }
  return [...byStart.values()].sort((a, b) =>
    a.startIso.localeCompare(b.startIso)
  );
}

export interface FreeFoundersOpts {
  founders: string[];
  startMs: number;
  durationMin: number;
  bufferMin: number;
  availability: Availability[];
  exceptions: AvailabilityException[];
  busyByFounder: Record<string, Interval[]>;
  tz: string;
}

/**
 * Which of `founders` are free for a concrete slot [start, start+dur+buffer).
 * Used at booking time to re-validate and to filter the auto-assign pool.
 */
export function freeFoundersForSlot(o: FreeFoundersOpts): string[] {
  const ymd = utcToYmd(new Date(o.startMs), o.tz);
  const weekday = weekdayOfYmd(ymd);
  const needMs = (o.durationMin + o.bufferMin) * MIN_MS;
  return o.founders.filter((f) => {
    const free = founderFreeIntervals({
      founderId: f,
      ymd,
      weekday,
      availability: o.availability,
      exceptions: o.exceptions,
      busy: o.busyByFounder[f] ?? [],
      bufferMin: o.bufferMin,
      tz: o.tz
    });
    return withinAny(free, o.startMs, o.startMs + needMs);
  });
}
