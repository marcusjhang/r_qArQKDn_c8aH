// Reusable config for the Hiring Pipeline Tracker (rating scale, statuses, default pipeline). Owners/interviewers and sources are deliberately NOT here — they're DB-driven (see service.ts `loadUsers`/`loadSources`).

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

/** Seed seniority bands (years → label); seniorityFor() sorts high-to-low, so authoring order here doesn't matter. */
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

/** Default important traits a new job starts with (tailored per job via the Traits modal). */
export const DEFAULT_TRAITS: string[] = [
  'Technical depth',
  'Communication',
  'Ownership',
  'Culture add'
];
