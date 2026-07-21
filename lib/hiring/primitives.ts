// Single source for the status and rating value-sets. Defined exactly once
// here and consumed by the DB enum (schema.ts), the TS types (types.ts), and
// the zod validators (schemas.ts) — so a new value is added in one place.

export const STATUSES = ['active', 'onhold', 'rejected', 'hired'] as const;
export type Status = (typeof STATUSES)[number];

export const RATING_VALUES = [1, 2, 3, 4] as const;
export type RatingValue = (typeof RATING_VALUES)[number];
