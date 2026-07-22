// Client-side calendar helpers. Everything displays in COMPANY_TZ; the pure
// tz helpers (client-safe) do the DST-correct math.

import {
  COMPANY_TZ,
  INTERVIEWER_COLORS,
  INTERVIEWER_COLOR_FALLBACK
} from '@/lib/hiring/config';
import { founderById } from '@/lib/hiring/helpers';
import { zonedTimeParts, weekdayOfYmd } from '@/lib/hiring/scheduling/tz';

/** Display window for the day/week time grid. */
export const DAY_START_MIN = 8 * 60; // 08:00
export const DAY_END_MIN = 19 * 60; // 19:00

// Name/initials go through the shared founderById (one unknown-id fallback for
// the whole app — the board and the calendar can't disagree); color stays a
// calendar concern.
export function founderName(id: string): string {
  return founderById(id).name;
}
export function founderInitials(id: string): string {
  return founderById(id).initials;
}
export function founderColor(id: string): string {
  return INTERVIEWER_COLORS[id] ?? INTERVIEWER_COLOR_FALLBACK;
}

export function localParts(iso: string) {
  return zonedTimeParts(new Date(iso), COMPANY_TZ);
}

export function fmtTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const am = h24 < 12;
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${String(mm).padStart(2, '0')} ${am ? 'am' : 'pm'}`;
}

export function fmtTimeIso(iso: string): string {
  return fmtTime(localParts(iso).minutes);
}

export function fmtDateTimeIso(iso: string): string {
  const { ymd, minutes } = localParts(iso);
  return `${dayLabel(ymd)}, ${fmtTime(minutes)}`;
}

/** 'YYYY-MM-DD' + N calendar days (UTC-space date arithmetic). */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(t));
}

/** Monday of the week containing `ymd`. */
export function weekMonday(ymd: string): string {
  const wd = weekdayOfYmd(ymd); // 0=Sun … 6=Sat
  const mondayIndex = (wd + 6) % 7; // 0=Mon … 6=Sun
  return addDaysYmd(ymd, -mondayIndex);
}

/** The `count` business days (Mon–Fri) starting at `mondayYmd`. */
export function weekDates(mondayYmd: string, count = 5): string[] {
  return Array.from({ length: count }, (_, i) => addDaysYmd(mondayYmd, i));
}

export function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPANY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}
