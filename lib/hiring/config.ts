// Reusable configuration for the Hiring Pipeline Tracker.
//
// This is the single place a new business adapts the tool: relabel the
// candidate sources, the rating scale, the statuses, or the default pipeline —
// no rendering code needs to change. Owners / interviewers are NOT configured
// here: they are the user accounts, read from the DB (see lib/hiring/service.ts
// `loadUsers`), so seeded users and new sign-ups are automatically selectable.

import type { RatingValue, Status } from './types';

/** Where candidates come from — reinforced by the source tag on each card. */
export const SOURCES: string[] = ['LinkedIn', 'Referral', 'YC', 'Inbound', 'Otta'];

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

/** Default seed pipeline (Decision 2). Editable per job after boot. */
export const DEFAULT_STAGES: string[] = [
  'Applied',
  'Screen',
  'Interview',
  'Offer',
  'Hired'
];
