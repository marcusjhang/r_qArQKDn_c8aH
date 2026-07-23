// Single source for the status and rating value-sets. Defined exactly once
// here and consumed by the DB enum (schema.ts), the TS types (types.ts), and
// the zod validators (schemas.ts) — so a new value is added in one place.

export const STATUSES = ['active', 'onhold', 'rejected', 'hired'] as const;
export type Status = (typeof STATUSES)[number];

export const RATING_VALUES = [1, 2, 3, 4] as const;
export type RatingValue = (typeof RATING_VALUES)[number];

// Upper bound on a candidate's years of experience. Single-sourced here so the
// DB CHECK (schema/hiring.ts), the zod validator (schemas.ts), and the UI bounds
// all derive from one number and can't drift.
export const MAX_YEARS_EXPERIENCE = 60;

// Upper bound on a stage time-limit (SLA), in whole days. Single-sourced here
// so the DB CHECK (schema/hiring.ts), the /settings zod validator, and the UI
// bounds all derive from one number and can't drift. One year is a generous
// ceiling — a stage limit is about catching stalled applicants, not archival.
export const MAX_SLA_DAYS = 365;
