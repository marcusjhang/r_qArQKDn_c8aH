// Years-of-experience parsing and the derived seniority band. The band mapping
// itself is DB-driven (see service `loadBands`); this is the pure resolution.

import { MAX_YEARS_EXPERIENCE } from '../primitives';
import type { SeniorityBand } from '../types';

// Re-exported from primitives (the single source) so components importing from
// the `@/lib/hiring` barrel get the bound alongside the seniority helpers.
export { MAX_YEARS_EXPERIENCE } from '../primitives';

/**
 * Seniority band label for a candidate's years of experience against the
 * configurable `bands` (from board state / DB), or null when experience is
 * unspecified or no band's threshold is met. Bands are scanned high-to-low so
 * the highest threshold the value meets wins, regardless of input order.
 */
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

/**
 * Parse a years-of-experience text input into the value we persist. Empty =
 * unspecified (null). Shared by the add-candidate modal and the detail drawer
 * so both enforce the same rule (whole number, 0…MAX_YEARS_EXPERIENCE).
 */
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
