// Half-open interval math over epoch-millisecond ranges [start, end).
// Pure and framework-free.

export interface Interval {
  start: number;
  end: number;
}

/** Sort + merge overlapping/adjacent intervals. */
export function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

/** Remove `cut` from `iv`, yielding 0, 1, or 2 remaining pieces. */
export function subtractOne(iv: Interval, cut: Interval): Interval[] {
  if (cut.end <= iv.start || cut.start >= iv.end) return [{ ...iv }]; // no overlap
  const pieces: Interval[] = [];
  if (cut.start > iv.start) pieces.push({ start: iv.start, end: cut.start });
  if (cut.end < iv.end) pieces.push({ start: cut.end, end: iv.end });
  return pieces;
}

/** Subtract every `cut` from every `base` interval. */
export function subtract(bases: Interval[], cuts: Interval[]): Interval[] {
  let current = merge(bases);
  for (const cut of merge(cuts)) {
    const next: Interval[] = [];
    for (const iv of current) next.push(...subtractOne(iv, cut));
    current = next;
  }
  return current;
}

/** True if [start, end) fits entirely inside one of the intervals. */
export function withinAny(intervals: Interval[], start: number, end: number): boolean {
  return intervals.some((iv) => start >= iv.start && end <= iv.end);
}

/** Expand each interval by `padMs` on both sides (used to enforce buffers). */
export function pad(intervals: Interval[], padMs: number): Interval[] {
  return intervals.map((i) => ({ start: i.start - padMs, end: i.end + padMs }));
}
