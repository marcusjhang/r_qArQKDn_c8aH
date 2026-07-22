// Reusable configuration for the Hiring Pipeline Tracker.
//
// This is the single place a new business adapts the tool: relabel the
// founders/owners, the candidate sources, the rating scale, the statuses,
// or the default pipeline — no rendering code needs to change.

import type { Founder, RatingValue, Status } from './types';
import type { InterviewType } from './primitives';

/** Owners / interviewers. For Lightsprint: the three founders. */
export const FOUNDERS: Founder[] = [
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

/* ---------- Needs-attention thresholds ---------- */

/** A non-terminal candidate this many days in a non-scheduling stage is stale. */
export const STALE_AFTER_DAYS = 3;

/** Stages whose next action is booking a live touchpoint (case-insensitive). */
export const SCHEDULING_STAGES: string[] = ['Screen', 'Interview'];

/** Days after a completed touchpoint with no decision before nudging. */
export const AWAITING_DECISION_AFTER_DAYS = 2;

/* ---------- Interview scheduling & calendar ---------- */

/** The single timezone availability is authored and the calendar displays in. */
export const COMPANY_TZ = 'America/New_York';

/** Per-interview-type defaults: length, gap after, and panel size. */
export const INTERVIEW_DEFAULTS: Record<
  InterviewType,
  { durationMin: number; bufferMin: number; panelSize: number; label: string }
> = {
  screen: { durationMin: 30, bufferMin: 15, panelSize: 1, label: 'Screen' },
  interview: { durationMin: 45, bufferMin: 15, panelSize: 2, label: 'Interview' },
  onsite: { durationMin: 60, bufferMin: 30, panelSize: 3, label: 'Onsite' }
};

export const SLOT_STEP_MIN = 30;
export const MIN_NOTICE_HOURS = 12;
export const BOOKING_DAYS = 10;
export const BUSINESS_DAYS: number[] = [1, 2, 3, 4, 5];
export const HOLIDAYS: string[] = [];
export const DEFAULT_WORK_HOURS = { startMinute: 9 * 60, endMinute: 17 * 60 };

/** Stable display color per interviewer, keyed by FOUNDERS id. */
export const INTERVIEWER_COLORS: Record<string, string> = {
  bo: '#2f6feb',
  bc: '#8b5cf6',
  hl: '#0e9f6e'
};
export const INTERVIEWER_COLOR_FALLBACK = '#6b7280';
