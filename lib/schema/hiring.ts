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
  check,
  unique,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  STATUSES,
  MAX_YEARS_EXPERIENCE,
  DEFAULT_STAGE_WARN_DAYS,
  MAX_STAGE_WARN_DAYS,
  type RatingValue
} from '../hiring/primitives';
import { users } from './auth';

// Orthogonal candidate status (Decision 3), built from the single-sourced
// STATUSES tuple so the DB enum and the TS Status type can never diverge.
export const candidateStatusEnum = pgEnum('candidate_status', STATUSES);

// Candidate sources (where a candidate came from) — a seeded lookup table, not
// a hardcoded list, so the options are DB-driven like the users picklist.
export const sources = pgTable(
  'sources',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    // Case-insensitive uniqueness — "LinkedIn" and "linkedin" are the same
    // source. Backs the client's case-insensitive dedup at the DB level.
    nameLowerUnique: uniqueIndex('sources_name_lower_unique').on(
      sql`lower(${t.name})`
    )
  })
);

// Seniority bands — the configurable years-of-experience → label mapping,
// managed from /settings and seeded in db/seed.ts. A candidate's band is
// derived (never stored) by finding the highest `minYears` threshold its
// yearsExperience meets (see seniorityFor). DB-driven like sources/users.
export const seniorityBands = pgTable('seniority_bands', {
  id: serial('id').primaryKey(),
  label: text('label').notNull(),
  // Inclusive lower bound in whole years; unique so thresholds can't collide.
  minYears: integer('min_years').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Pipeline settings — a single row holding the one universal "warn after N days
// in a stage" threshold, managed from /settings and seeded in db/seed.ts. The
// board flags a candidate as overdue once they have sat in their CURRENT stage
// for at least `stageWarnDays` whole days, applied uniformly to every stage (no
// per-stage config). Singleton: the seed ensures exactly one row and the update
// action edits it in place.
export const pipelineSettings = pgTable(
  'pipeline_settings',
  {
    id: serial('id').primaryKey(),
    // Whole days a candidate may sit in ANY stage before the board warns.
    stageWarnDays: integer('stage_warn_days')
      .notNull()
      .default(DEFAULT_STAGE_WARN_DAYS),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    // At least a day, at most MAX_STAGE_WARN_DAYS — DB-level teeth so a bad
    // write can't slip past the zod validator.
    warnRange: check(
      'pipeline_settings_warn_range',
      sql`${t.stageWarnDays} between 1 and ${sql.raw(String(MAX_STAGE_WARN_DAYS))}`
    )
  })
);

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

export const candidates = pgTable(
  'candidates',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    stage: text('stage').notNull(),
    // When the candidate entered its CURRENT stage. Set on insert and reset on
    // every stage change (see moveStage / setStatus in actions.ts), so it
    // always measures time-in-current-stage — the basis for the overdue
    // warning (see stageOverdue in helpers.ts). Renaming/reordering a stage
    // does NOT move the candidate, so it leaves this untouched.
    stageEnteredAt: timestamp('stage_entered_at').defaultNow().notNull(),
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
    // Seniority proxy: whole years of experience. Nullable — null means
    // "unspecified" (the seniority band is derived from this in the UI). The
    // CHECK below backs the 0–MAX bound at the DB level.
    yearsExperience: integer('years_experience'),
    status: candidateStatusEnum('status').notNull().default('active'),
    // Starred candidates float to the top of their column as highlighted
    // standouts (unbounded — unlike starred jobs, they don't pin as tabs).
    starred: boolean('starred').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    yearsRange: check(
      'years_experience_range',
      sql`${t.yearsExperience} is null or ${t.yearsExperience} between 0 and ${sql.raw(
        String(MAX_YEARS_EXPERIENCE)
      )}`
    )
  })
);

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
    ratingRange: check('rating_range', sql`${t.rating} between 1 and 4`),
    // One entry per interviewer per candidate (Decision 7) — enforced, not just
    // documented. Re-rating requires editing the existing entry, not a 2nd row.
    oneByUserPerCandidate: unique('feedback_candidate_by_user_unique').on(
      t.candidateId,
      t.byUser
    )
  })
);

// Per-candidate discussion thread (the "chat" that follows the applicant).
// One row per message; authored by a login account and pinned to a candidate,
// so it survives stage moves and cascades away only when the candidate is
// deleted.
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  candidateId: integer('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  // The login account that wrote the message.
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// One row per (message, tagged account). Drives the notification inbox:
// `readAt` is null until the tagged user opens the notification, and
// `dismissedAt` is null until they clear it from the inbox. Both are soft flags
// (never a delete) so the row still records who was tagged, which drives the
// @-mention highlighting on the message itself. Cascades with its message (and
// therefore with the candidate).
export const mentions = pgTable('mentions', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  // The tagged login account.
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  readAt: timestamp('read_at'),
  // Set when the tagged user clears the notification from their inbox; dismissed
  // mentions drop out of `notificationsFor` but the row (and its highlight)
  // stays.
  dismissedAt: timestamp('dismissed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export type SelectJob = typeof jobs.$inferSelect;
export type SelectCandidate = typeof candidates.$inferSelect;
export type SelectFeedback = typeof feedback.$inferSelect;
export type SelectSource = typeof sources.$inferSelect;
export type SelectSeniorityBand = typeof seniorityBands.$inferSelect;
export type SelectPipelineSettings = typeof pipelineSettings.$inferSelect;
export type SelectMessage = typeof messages.$inferSelect;
export type SelectMention = typeof mentions.$inferSelect;

/* ---------- Relations (enable the db.query relational API) ---------- */
export const jobsRelations = relations(jobs, ({ many }) => ({
  candidates: many(candidates)
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  job: one(jobs, { fields: [candidates.jobId], references: [jobs.id] }),
  feedback: many(feedback),
  messages: many(messages)
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  candidate: one(candidates, {
    fields: [feedback.candidateId],
    references: [candidates.id]
  })
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  candidate: one(candidates, {
    fields: [messages.candidateId],
    references: [candidates.id]
  }),
  author: one(users, {
    fields: [messages.authorId],
    references: [users.id]
  }),
  mentions: many(mentions)
}));

export const mentionsRelations = relations(mentions, ({ one }) => ({
  message: one(messages, {
    fields: [mentions.messageId],
    references: [messages.id]
  }),
  user: one(users, {
    fields: [mentions.userId],
    references: [users.id]
  })
}));
