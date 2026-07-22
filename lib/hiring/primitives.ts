// Single source for the status and rating value-sets. Defined exactly once
// here and consumed by the DB enum (schema.ts), the TS types (types.ts), and
// the zod validators (schemas.ts) — so a new value is added in one place.

export const STATUSES = ['active', 'onhold', 'rejected', 'hired'] as const;
export type Status = (typeof STATUSES)[number];

export const RATING_VALUES = [1, 2, 3, 4] as const;
export type RatingValue = (typeof RATING_VALUES)[number];

/* ---------- Scheduling touchpoint + interview value-sets ---------- */

// Recruiter-driven touchpoint state on a candidate in a scheduling stage.
// `null` (no value) means unscheduled.
export const SCHEDULE_STATUSES = ['scheduled', 'completed'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const INTERVIEW_TYPES = ['screen', 'interview', 'onsite'] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_STATUSES = [
  'pending_booking',
  'scheduled',
  'completed',
  'cancelled',
  'no_show'
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const PANEL_ROLES = ['lead', 'interviewer', 'shadow'] as const;
export type PanelRole = (typeof PANEL_ROLES)[number];

export const PANEL_MEMBER_STATUSES = ['invited', 'accepted', 'declined'] as const;
export type PanelMemberStatus = (typeof PANEL_MEMBER_STATUSES)[number];

export const LOCATION_KINDS = ['video', 'phone', 'onsite'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const BOOKING_TOKEN_STATUSES = [
  'active',
  'used',
  'expired',
  'revoked'
] as const;
export type BookingTokenStatus = (typeof BOOKING_TOKEN_STATUSES)[number];

export const EMAIL_KINDS = [
  'invite',
  'candidate_confirmation',
  'interviewer_notification',
  'reminder',
  'reschedule',
  'cancellation'
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const EMAIL_STATUSES = ['queued', 'sent', 'failed'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

// In-app notifications to a candidate's owner: a 'scheduled' event plus the
// warning states mirrored from the board's attention chips.
export const NOTIFICATION_KINDS = [
  'scheduled',
  'needs_scheduling',
  'interview_overdue',
  'awaiting_decision',
  'stale'
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
