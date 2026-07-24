import 'server-only';

// Runtime (zod) validation for the server-action boundary, since actions receive serialized client input. Value-sets come from the single source in primitives; id references are backed by FKs at the DB level.

import { z } from 'zod';
import { createInsertSchema } from 'drizzle-zod';
import { candidates, feedback } from '@/lib/schema/hiring';
import {
  STATUSES,
  RATING_VALUES,
  MAX_YEARS_EXPERIENCE,
  MAX_IMPORT_ROWS,
  type RatingValue
} from './primitives';
import {
  MAX_TRAITS,
  MAX_TRAIT_NAME,
  MAX_TRAIT_WORDS,
  MAX_JOB_DESCRIPTION
} from './helpers';

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
// Optional profile link: blank collapses to null, else a valid http(s) URL (≤ 500 chars). Client mirror is normalizeProfileUrl.
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

const zTraitName = z
  .string()
  .trim()
  .min(1)
  .max(MAX_TRAIT_NAME)
  .refine((s) => s.split(/\s+/).length <= MAX_TRAIT_WORDS, {
    message: `Traits must be ${MAX_TRAIT_WORDS} words or fewer.`
  });

/** A job's trait list: capped, case-insensitively unique after trimming; order preserved (order = rank = weight). */
export const zTraitList = z
  .array(zTraitName)
  .max(MAX_TRAITS)
  .refine(
    (names) => new Set(names.map((n) => n.toLowerCase())).size === names.length,
    { message: 'Traits must be unique.' }
  );

/** Per-trait scores (trait name → 1–4). Shape-validated here; the action further scopes them to the job's current traits. */
const zTraitScores = z.record(zTraitName, zRating);

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

// The Edit form validates the same fields as creation, so it reuses the insert schema (a named alias so the two can't drift).
export const candidateEditSchema = candidateInsertSchema;

export const feedbackInsertSchema = createInsertSchema(feedback, {
  // byUser is a user id; the FK to users.id is the existence guard.
  byUser: zId,
  traitScores: zTraitScores,
  note: zNote
}).pick({ byUser: true, traitScores: true, note: true });

/* CSV import ------------------------------------------------------------ */

// One resolved import row (re-validated server-side; client-resolved ids are never trusted). `jobId`/`source` are null when the job/source must be created; `stage` is optional (defaults to first stage), `status` defaults to active.
const candidateImportRowSchema = z.object({
  name: zName,
  jobId: zId.nullable(),
  jobTitle: zJobTitle,
  stage: zStageName.optional(),
  status: zStatus.default('active'),
  owner: zId,
  source: zId.nullable(),
  sourceName: zName,
  yearsExperience: zYears,
  linkedinUrl: zProfileUrl,
  githubUrl: zProfileUrl
});

// A single import call is capped; the client resolver mirrors this so an over-cap file is blocked in the preview.
export const importCandidatesSchema = z
  .array(candidateImportRowSchema)
  .max(MAX_IMPORT_ROWS);
