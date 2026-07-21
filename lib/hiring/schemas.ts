import 'server-only';

// Runtime validation for the server-action boundary. Server actions receive
// serialized client input, so types alone are not enough — these zod schemas
// enforce the same constraints at runtime. Everything is built from the single
// sources: STATUSES / RATING_VALUES (primitives) and FOUNDERS / SOURCES (config).

import { z } from 'zod';
import { createInsertSchema } from 'drizzle-zod';
import { candidates, feedback } from '@/lib/schema';
import { STATUSES, RATING_VALUES, type RatingValue } from './primitives';
import { FOUNDERS, SOURCES } from './config';

const founderIds = FOUNDERS.map((f) => f.id) as [string, ...string[]];
const sourceNames = [...SOURCES] as [string, ...string[]];

/* Scalar validators */
export const zId = z.number().int().positive();
export const zIndex = z.number().int().min(0);
export const zDir = z.union([z.literal(1), z.literal(-1)]);
export const zStatus = z.enum(STATUSES);
export const zOwner = z.enum(founderIds);
export const zSource = z.enum(sourceNames);
export const zName = z.string().trim().min(1).max(120);
export const zStageName = z.string().trim().min(1).max(48);
export const zNote = z.string().max(2000);
export const zRating = z
  .number()
  .int()
  .refine(
    (n): n is RatingValue => (RATING_VALUES as readonly number[]).includes(n),
    { message: 'Rating must be 1–4' }
  );

/* Insert shapes derived from the tables via drizzle-zod, refined to app rules */
export const candidateInsertSchema = createInsertSchema(candidates, {
  name: zName,
  source: zSource,
  owner: zOwner
}).pick({ name: true, source: true, owner: true });

export const feedbackInsertSchema = createInsertSchema(feedback, {
  byFounder: zOwner,
  rating: zRating,
  note: zNote
}).pick({ byFounder: true, rating: true, note: true });
