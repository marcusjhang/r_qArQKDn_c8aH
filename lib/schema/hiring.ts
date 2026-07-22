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
import { users } from './auth';

// Orthogonal candidate status (Decision 3), built from the single-sourced
// STATUSES tuple so the DB enum and the TS Status type can never diverge.
export const candidateStatusEnum = pgEnum('candidate_status', STATUSES);

// Candidate sources (where a candidate came from) — a seeded lookup table, not
// a hardcoded list, so the options are DB-driven like the users picklist.
export const sources = pgTable('sources', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

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
  // The accountable owner — a user account (see lib/schema/auth.ts).
  owner: integer('owner')
    .notNull()
    .references(() => users.id),
  // Where the candidate came from — a seeded source (see sources table above).
  source: integer('source')
    .notNull()
    .references(() => sources.id),
  // Optional profile links (nullable — empty input stays NULL).
  linkedinUrl: text('linkedin_url'),
  githubUrl: text('github_url'),
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
    // The interviewer — a user account (see lib/schema/auth.ts).
    byUser: integer('by_user')
      .notNull()
      .references(() => users.id),
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
export type SelectSource = typeof sources.$inferSelect;

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
