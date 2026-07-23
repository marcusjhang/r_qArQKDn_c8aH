import 'server-only';

// Runtime validation for the server-action boundary. Server actions receive
// serialized client input, so types alone are not enough — these zod schemas
// enforce the same constraints at runtime. Value-sets come from the single
// source STATUSES / RATING_VALUES (primitives). The owner, feedback-author, and
// source references are ids, validated as ids here and backed by foreign keys
// (users / sources) at the DB level.

import { z } from 'zod';
import { createInsertSchema } from 'drizzle-zod';
import { candidates, feedback } from '@/lib/schema/hiring';
import {
  STATUSES,
  RATING_VALUES,
  MAX_YEARS_EXPERIENCE,
  type RatingValue
} from './primitives';
import { MAX_TRAITS, MAX_TRAIT_NAME, MAX_JOB_DESCRIPTION } from './helpers';

/* Scalar validators */
export const zId = z.number().int().positive();
export const zIndex = z.number().int().min(0);
export const zDir = z.union([z.literal(1), z.literal(-1)]);
export const zStatus = z.enum(STATUSES);
export const zName = z.string().trim().min(1).max(120);
export const zStageName = z.string().trim().min(1).max(48);
export const zJobTitle = z.string().trim().min(1).max(80);
export const zJobDescription = z.string().max(MAX_JOB_DESCRIPTION);
export const zNote = z.string().max(2000);
// Optional profile link: blank/whitespace collapses to null; anything else must
// be a valid http(s) URL (≤ 500 chars). The client mirror is normalizeProfileUrl
// (helpers), kept in sync via the shared MAX_PROFILE_URL bound.
export const zProfileUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), {
      message: 'Must be a valid http(s) URL'
    })
    .nullable()
);
export const zYears = z
  .number()
  .int()
  .min(0)
  .max(MAX_YEARS_EXPERIENCE)
  .nullable();
export const zRating = z
  .number()
  .int()
  .refine(
    (n): n is RatingValue => (RATING_VALUES as readonly number[]).includes(n),
    { message: 'Rating must be 1–4' }
  );

export const zTraitName = z.string().trim().min(1).max(MAX_TRAIT_NAME);

/**
 * A job's trait list: capped, and case-insensitively unique after trimming
 * (mirrors the stage-name rules). Order is preserved (order = rank = weight).
 */
export const zTraitList = z
  .array(zTraitName)
  .max(MAX_TRAITS)
  .refine(
    (names) => new Set(names.map((n) => n.toLowerCase())).size === names.length,
    { message: 'Traits must be unique.' }
  );

/**
 * Per-trait scores on a feedback entry: a map of trait name → 1–4 score. Keys
 * are shape-validated here; the action further intersects them with the job's
 * current traits so stray/renamed keys never persist.
 */
export const zTraitScores = z.record(zTraitName, zRating);

/* Insert shapes derived from the tables via drizzle-zod, refined to app rules */
export const candidateInsertSchema = createInsertSchema(candidates, {
  name: zName,
  // source is a sources.id; owner is a users.id — the FKs are the existence guards.
  source: zId,
  owner: zId,
  linkedinUrl: zProfileUrl,
  githubUrl: zProfileUrl,
  yearsExperience: zYears
}).pick({
  name: true,
  source: true,
  owner: true,
  linkedinUrl: true,
  githubUrl: true,
  yearsExperience: true
});

// The detail drawer's Edit form validates the same fields as creation, so it
// reuses the insert schema outright rather than restating it (the two can't
// drift). Kept as a named alias to document the edit-path intent at call sites.
export const candidateEditSchema = candidateInsertSchema;

export const feedbackInsertSchema = createInsertSchema(feedback, {
  // byUser is a user id; the FK to users.id is the existence guard.
  byUser: zId,
  traitScores: zTraitScores,
  note: zNote
}).pick({ byUser: true, traitScores: true, note: true });
