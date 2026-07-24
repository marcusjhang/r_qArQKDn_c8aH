// Years-of-experience parsing and the derived seniority band (the band mapping itself is DB-driven; see service `loadBands`).

import { MAX_YEARS_EXPERIENCE } from '../primitives';
import type { SeniorityBand } from '../types';

// Re-exported from primitives (the single source) so barrel consumers get the bound alongside these helpers.
export { MAX_YEARS_EXPERIENCE } from '../primitives';

/** Seniority band label for a candidate's years against `bands`, or null when unspecified / no threshold met. Scanned high-to-low so the highest met threshold wins, regardless of input order. */
export function seniorityFor(
  bands: SeniorityBand[],
  years: number | null | undefined
): string | null {
  if (years == null) return null;
  return (
    [...bands]
      .sort((a, b) => b.minYears - a.minYears)
      .find((b) => years >= b.minYears)?.label ?? null
  );
}

/** Parse a years-of-experience input into the persisted value: empty = unspecified (null), else a whole number 0…MAX_YEARS_EXPERIENCE. */
export function parseYearsInput(raw: string): {
  value: number | null;
  ok: boolean;
} {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, ok: true };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > MAX_YEARS_EXPERIENCE) {
    return { value: null, ok: false };
  }
  return { value: n, ok: true };
}

/** Canonical text form of a stored years value (null → empty string). */
export function yearsToText(years: number | null | undefined): string {
  return years == null ? '' : String(years);
}
