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

// The one universal "warn after N days in a stage" threshold. Applies to every
// stage: a candidate is overdue once they have sat in their current stage for at
// least this many whole days. Single-sourced here so the DB default/CHECK
// (schema/hiring.ts), the /settings zod validator, and the UI bounds can't
// drift. DEFAULT is the seeded/starting value; MAX is a generous ceiling (one
// year — this is about catching stalled applicants, not archival).
export const DEFAULT_STAGE_WARN_DAYS = 5;
export const MAX_STAGE_WARN_DAYS = 365;

// Most candidates a single CSV import may create at once. Single-sourced here so
// the server's zod bound (schemas.ts) and the client resolver/preview
// (import.ts) enforce the same limit — the client blocks over-cap uploads before
// submit rather than letting the server reject them with a stuck dialog.
export const MAX_IMPORT_ROWS = 1000;
