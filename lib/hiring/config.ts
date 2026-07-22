// Reusable configuration for the Hiring Pipeline Tracker.
//
// This is the single place a new business adapts the tool: relabel the
// users/owners, the candidate sources, the rating scale, the statuses,
// or the default pipeline — no rendering code needs to change.

import type { RatingValue, Status, User } from './types';

/** Owners / interviewers — the users who work the pipeline. */
export const USERS: User[] = [
  { id: 'ma', name: 'Marcus Ang', initials: 'MA' },
  { id: 'bo', name: 'Ben Ong', initials: 'BO' },
  { id: 'bc', name: 'Benedict Chan', initials: 'BC' },
  { id: 'hl', name: 'Heng Hong Lee', initials: 'HL' }
];

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
