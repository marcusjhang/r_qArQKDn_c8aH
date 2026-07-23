// Reusable configuration for the Hiring Pipeline Tracker.
//
// This is the single place a new business adapts the tool: relabel the rating
// scale, the statuses, or the default pipeline — no rendering code needs to
// change. Two things are deliberately NOT configured here, because they are
// DB-driven (read from seeded tables, so seed data and sign-ups flow through
// automatically): owners/interviewers (the user accounts, see service.ts
// `loadUsers`) and candidate sources (the `sources` table, see `loadSources`).

import type { RatingValue, Status } from './types';

/** Display name for the application brand (used in alt text, titles, etc.). */
export const APP_NAME = 'Lightsprint';

/** 4-point verdict scale (Decision 4). `cls` maps to a color chip in the CSS. */
export const RATINGS: Record<RatingValue, { label: string; cls: string }> = {
  1: { label: 'Strong No', cls: 'sno' },
  2: { label: 'No', cls: 'no' },
  3: { label: 'Yes', cls: 'yes' },
  4: { label: 'Strong Yes', cls: 'syes' }
};

/** Orthogonal candidate status (Decision 3). */
export const STATUS: Record<Status, string> = {
  active: 'Active',
  onhold: 'On hold',
  rejected: 'Rejected',
  hired: 'Hired'
};

/**
 * Seniority bands derived from a candidate's years of experience. The helper
 * seniorityFor() sorts these high-to-low, so authoring order here doesn't
 * matter — relabeling tiers or shifting thresholds needs no rendering change.
 */
export const SENIORITY_BANDS: { label: string; minYears: number }[] = [
  { label: 'Senior', minYears: 5 },
  { label: 'Mid', minYears: 2 },
  { label: 'Junior', minYears: 0 }
];

/** Default seed pipeline (Decision 2). Editable per job after boot. */
export const DEFAULT_STAGES: string[] = [
  'Applied',
  'Screen',
  'Interview',
  'Offer',
  'Hired'
];
