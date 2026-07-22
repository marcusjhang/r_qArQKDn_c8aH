// Hiring Pipeline Tracker domain schema: the jobs → candidates → feedback
// tables plus the relational wiring for the db.query API. Reads go through
// lib/hiring/service.ts; writes through the zod-validated server actions in
// lib/hiring/actions.ts.

import {
  pgTable,
  text,
  integer,
  timestamp,
  pgEnum,
  serial,
  boolean,
  check
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { STATUSES, type RatingValue } from '../hiring/primitives';

// Orthogonal candidate status (Decision 3), built from the single-sourced
// STATUSES tuple so the DB enum and the TS Status type can never diverge.
export const candidateStatusEnum = pgEnum('candidate_status', STATUSES);

// A job owns its own ordered, per-job stage list (Decision 1), stored as an
// ordered JSON array of stage names so candidates can key off the stage name.
export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  // Native text[] (not jsonb) — a real array, so it round-trips cleanly and
  // stays inspectable/queryable in SQL.
  stages: text('stages').array().notNull(),
  position: integer('position').notNull().default(0),
  // Starred jobs are pinned as inline tabs (shown outside the jobs dropdown).
  starred: boolean('starred').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const candidates = pgTable('candidates', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  stage: text('stage').notNull(),
  // Founder id from the FOUNDERS config — the single accountable owner.
  owner: text('owner').notNull(),
  source: text('source').notNull(),
  status: candidateStatusEnum('status').notNull().default('active'),
  // Starred candidates float to the top of their column as highlighted
  // standouts (unbounded — unlike starred jobs, they don't pin as tabs).
  starred: boolean('starred').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// One entry per interviewer (Decision 7).
export const feedback = pgTable(
  'feedback',
  {
    id: serial('id').primaryKey(),
    candidateId: integer('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    // Founder id of the interviewer.
    byFounder: text('by_founder').notNull(),
    // 4-point verdict rating (1 = Strong No … 4 = Strong Yes). $type pins the
    // column to RatingValue; the CHECK below backs that at the DB level.
    rating: integer('rating').$type<RatingValue>().notNull(),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    ratingRange: check('rating_range', sql`${t.rating} between 1 and 4`)
  })
);

export type SelectJob = typeof jobs.$inferSelect;
export type SelectCandidate = typeof candidates.$inferSelect;
export type SelectFeedback = typeof feedback.$inferSelect;

/* ---------- Relations (enable the db.query relational API) ---------- */
export const jobsRelations = relations(jobs, ({ many }) => ({
  candidates: many(candidates)
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  job: one(jobs, { fields: [candidates.jobId], references: [jobs.id] }),
  feedback: many(feedback)
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  candidate: one(candidates, {
    fields: [feedback.candidateId],
    references: [candidates.id]
  })
}));
