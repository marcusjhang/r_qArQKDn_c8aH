// Hiring Pipeline Tracker domain schema: the jobs → candidates → feedback tables
// plus the relational wiring for the db.query API.

import {
  pgTable,
  text,
  integer,
  timestamp,
  pgEnum,
  serial,
  boolean,
  jsonb,
  check,
  unique,
  uniqueIndex,
  index
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  STATUSES,
  MAX_YEARS_EXPERIENCE,
  DEFAULT_STAGE_WARN_DAYS,
  MAX_STAGE_WARN_DAYS,
  type TraitScores
} from '../hiring/primitives';
import { users } from './auth';

// Candidate status, built from the single-sourced STATUSES tuple so the DB enum
// and the TS Status type can never diverge.
export const candidateStatusEnum = pgEnum('candidate_status', STATUSES);

// Candidate sources — a seeded, DB-driven lookup table, not a hardcoded list.
export const sources = pgTable(
  'sources',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    // Case-insensitive uniqueness — "LinkedIn" and "linkedin" are the same source.
    nameLowerUnique: uniqueIndex('sources_name_lower_unique').on(
      sql`lower(${t.name})`
    )
  })
);

// Seniority bands — the configurable years-of-experience → label mapping. A
// candidate's band is derived (never stored) from the highest `minYears` it meets.
export const seniorityBands = pgTable('seniority_bands', {
  id: serial('id').primaryKey(),
  label: text('label').notNull(),
  // Inclusive lower bound in whole years; unique so thresholds can't collide.
  minYears: integer('min_years').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Pipeline settings — a singleton row holding the universal "warn after N days in
// a stage" threshold; the board flags a candidate overdue once they've sat in
// their current stage that many whole days, applied uniformly to every stage.
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
    // DB-level teeth (1..MAX_STAGE_WARN_DAYS) so a bad write can't slip past the zod validator.
    warnRange: check(
      'pipeline_settings_warn_range',
      sql`${t.stageWarnDays} between 1 and ${sql.raw(String(MAX_STAGE_WARN_DAYS))}`
    )
  })
);

// A job owns its own ordered, per-job stage list so candidates key off the stage name.
export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  // Native text[] (not jsonb) so it round-trips cleanly and stays queryable in SQL.
  stages: text('stages').array().notNull(),
  // Ordered per-job trait list; array order IS the ranking (index 0 = most
  // important), driving the weighted overall score.
  traits: text('traits').array().notNull().default(sql`'{}'::text[]`),
  // Pasteable job description (JD); the AI trait suggester reads it.
  description: text('description'),
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
    // When the candidate entered its CURRENT stage; reset on every stage change,
    // so it always measures time-in-current-stage (the basis for the overdue warning).
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
    // Whole years of experience; nullable ("unspecified"). The CHECK below backs the 0–MAX bound.
    yearsExperience: integer('years_experience'),
    status: candidateStatusEnum('status').notNull().default('active'),
    // Starred candidates float to the top of their column (unbounded, unlike starred jobs).
    starred: boolean('starred').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    yearsRange: check(
      'years_experience_range',
      sql`${t.yearsExperience} is null or ${t.yearsExperience} between 0 and ${sql.raw(
        String(MAX_YEARS_EXPERIENCE)
      )}`
    ),
    // FKs aren't auto-indexed; per-job reads and the delete cascade filter by job_id.
    jobIdIdx: index('candidates_job_id_idx').on(t.jobId)
  })
);

// One entry per interviewer per candidate.
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
    // Per-trait scores (1–4) keyed by the job's trait name; the candidate's
    // headline score is the rank-weighted average of these across entries.
    traitScores: jsonb('trait_scores')
      .$type<TraitScores>()
      .notNull()
      .default({}),
    // The candidate's stage when this entry was left, so feedback stays anchored
    // to the round it was gathered in even after the candidate advances.
    stage: text('stage').notNull().default(''),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    // One entry per interviewer per candidate — re-scoring edits the existing row.
    oneByUserPerCandidate: unique('feedback_candidate_by_user_unique').on(
      t.candidateId,
      t.byUser
    ),
    // DB-level teeth for the trait-score value-set: every jsonb value must be an
    // integer 1..4, so a write bypassing the zod validator still can't persist an
    // out-of-range score. Asserts "no value fails the scale" via jsonb_path_exists.
    traitScoresValues: check(
      'feedback_trait_scores_values',
      sql`not jsonb_path_exists(${t.traitScores}, '$.* ? (@.type() != "number" || @ < 1 || @ > 4 || @.floor() != @)')`
    )
  })
);

// Per-candidate discussion thread. One row per message, pinned to a candidate so
// it survives stage moves and cascades away only when the candidate is deleted.
export const messages = pgTable(
  'messages',
  {
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
  },
  (t) => ({
    // Thread reads filter by candidate_id; FKs aren't auto-indexed.
    candidateIdIdx: index('messages_candidate_id_idx').on(t.candidateId)
  })
);

// One row per (message, tagged account), driving the notification inbox. `readAt`
// and `dismissedAt` are soft flags (never a delete) so the row still records who
// was tagged, which drives the @-mention highlighting. Cascades with its message.
export const mentions = pgTable(
  'mentions',
  {
    id: serial('id').primaryKey(),
    messageId: integer('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    // The tagged login account.
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at'),
    // Set when the tagged user clears the notification; dismissed mentions drop
    // out of `notificationsFor` but the row (and its highlight) stays.
    dismissedAt: timestamp('dismissed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    // The inbox filters by user_id and the delete cascade by message_id — index
    // both (FKs aren't auto-indexed) so neither degrades to a full scan.
    userIdIdx: index('mentions_user_id_idx').on(t.userId),
    messageIdIdx: index('mentions_message_id_idx').on(t.messageId)
  })
);

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
