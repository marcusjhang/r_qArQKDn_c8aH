// Timezone helpers with NO date library. Every offset is resolved for a
// concrete instant via Intl.DateTimeFormat, so recurring wall-clock rules stay
// correct across DST transitions.

const MIN_MS = 60_000;

/**
 * Minutes that local time in `tz` is ahead of UTC at the given instant.
 * e.g. America/New_York in winter → -300 (EST), in summer → -240 (EDT).
 */
export function offsetMinutes(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // some engines emit '24' for midnight
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  return Math.round((asUTC - instant.getTime()) / MIN_MS);
}

/** Weekday (0=Sun … 6=Sat) of a 'YYYY-MM-DD' calendar date. */
export function weekdayOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The UTC instant for a local wall-clock time: `ymd` (YYYY-MM-DD in `tz`) at
 * `minutes` past local midnight. Resolved twice to stay correct across the
 * spring-forward / fall-back boundary.
 */
export function zonedWallClockToUtc(
  ymd: string,
  minutes: number,
  tz: string
): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  const guess = Date.UTC(y, m - 1, d, hour, min);
  const off1 = offsetMinutes(new Date(guess), tz);
  let utc = guess - off1 * MIN_MS;
  const off2 = offsetMinutes(new Date(utc), tz);
  if (off2 !== off1) utc = guess - off2 * MIN_MS;
  return new Date(utc);
}

/** Local calendar date + minutes-from-midnight of an instant, in `tz`. */
export function zonedTimeParts(
  instant: Date,
  tz: string
): { ymd: string; minutes: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const ymd = `${map.year}-${map.month}-${map.day}`;
  return {
    ymd,
    minutes: hour * 60 + Number(map.minute),
    weekday: weekdayOfYmd(ymd)
  };
}

/** 'YYYY-MM-DD' calendar date of an instant, in `tz`. */
export function utcToYmd(instant: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(instant);
}

/**
 * The next `count` business days (as YYYY-MM-DD strings in `tz`) on/after the
 * local date of `from`, skipping non-business weekdays and holidays.
 */
export function businessDaysFrom(
  from: Date,
  count: number,
  tz: string,
  businessDays: number[],
  holidays: string[]
): string[] {
  const out: string[] = [];
  const start = utcToYmd(from, tz);
  const [y, m, d] = start.split('-').map(Number);
  // Walk calendar dates in UTC-space purely for date arithmetic (no tz needed
  // to increment a Y-M-D), classifying each by weekday.
  let cursor = Date.UTC(y, m - 1, d);
  const holidaySet = new Set(holidays);
  let guard = 0;
  while (out.length < count && guard < count + 60) {
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(cursor));
    const wd = new Date(cursor).getUTCDay();
    if (businessDays.includes(wd) && !holidaySet.has(ymd)) out.push(ymd);
    cursor += 24 * 60 * MIN_MS;
    guard++;
  }
  return out;
}
