// Single source for the status and rating value-sets, consumed by the DB enum, the TS types, and the zod validators, so a new value is added in one place.

export const STATUSES = ['active', 'onhold', 'rejected', 'hired'] as const;
export type Status = (typeof STATUSES)[number];

export const RATING_VALUES = [1, 2, 3, 4] as const;
export type RatingValue = (typeof RATING_VALUES)[number];

// Per-trait scores on a feedback entry: trait name → 1–4 score (stored as jsonb).
// PARTIAL on purpose — an entry only stores scored traits, so every read is `RatingValue | undefined`, forcing the null-checks (a total Record would let a bare read ship a NaN).
export type TraitScores = Partial<Record<string, RatingValue>>;

// Upper bound on years of experience, single-sourced so the DB CHECK, zod validator, and UI bounds can't drift.
export const MAX_YEARS_EXPERIENCE = 60;

// The one universal "warn after N days in a stage" threshold, single-sourced so the DB default/CHECK, the /settings validator, and the UI bounds can't drift. DEFAULT is the seeded value; MAX is a one-year ceiling.
export const DEFAULT_STAGE_WARN_DAYS = 5;
export const MAX_STAGE_WARN_DAYS = 365;

// Most candidates a single CSV import may create, single-sourced so the server's zod bound and the client resolver/preview enforce the same limit.
export const MAX_IMPORT_ROWS = 1000;
