// Single source for the status and rating value-sets. Defined exactly once
// here and consumed by the DB enum (schema.ts), the TS types (types.ts), and
// the zod validators (schemas.ts) — so a new value is added in one place.

export const STATUSES = ['active', 'onhold', 'rejected', 'hired'] as const;
export type Status = (typeof STATUSES)[number];

export const RATING_VALUES = [1, 2, 3, 4] as const;
export type RatingValue = (typeof RATING_VALUES)[number];

// Per-trait scores attached to a feedback entry: a map of trait name (as
// defined on the job) to a score on the same 1–4 scale. Stored as jsonb
// (schema/hiring.ts), surfaced on the Feedback DTO (service/dtos.ts), and
// validated at the write boundary (schemas.ts).
export type TraitScores = Record<string, RatingValue>;

// Upper bound on a candidate's years of experience. Single-sourced here so the
// DB CHECK (schema/hiring.ts), the zod validator (schemas.ts), and the UI bounds
// all derive from one number and can't drift.
export const MAX_YEARS_EXPERIENCE = 60;
