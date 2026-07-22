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
  unique
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  STATUSES,
  INTERVIEW_TYPES,
  INTERVIEW_STATUSES,
  PANEL_ROLES,
  PANEL_MEMBER_STATUSES,
  LOCATION_KINDS,
  BOOKING_TOKEN_STATUSES,
  EMAIL_KINDS,
  EMAIL_STATUSES,
  NOTIFICATION_KINDS,
  type RatingValue,
  type ScheduleStatus
} from '../hiring/primitives';

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
  // When the candidate last entered its current stage. Reset on every stage
  // move so the board can flag candidates that have gone stale in a stage.
  stageEnteredAt: timestamp('stage_entered_at').defaultNow().notNull(),
  // Touchpoint (screen/interview) state, chosen by the recruiter or projected
  // from a real interview. Null means unscheduled — a warning in a scheduling
  // stage.
  scheduleStatus: text('schedule_status').$type<ScheduleStatus>(),
  // When the scheduled touchpoint is booked for (meaningful while 'scheduled').
  scheduledAt: timestamp('scheduled_at'),
  // When the touchpoint was marked 'completed'. Drives the "awaiting decision"
  // nudge once it has sat unresolved for too long.
  completedAt: timestamp('completed_at'),
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
  feedback: many(feedback),
  interviews: many(interviews)
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  candidate: one(candidates, {
    fields: [feedback.candidateId],
    references: [candidates.id]
  })
}));

/* ---------- Interview scheduling & shared calendar ---------- */

export const interviewTypeEnum = pgEnum('interview_type', INTERVIEW_TYPES);
export const interviewStatusEnum = pgEnum('interview_status', INTERVIEW_STATUSES);
export const panelRoleEnum = pgEnum('panel_role', PANEL_ROLES);
export const panelMemberStatusEnum = pgEnum(
  'panel_member_status',
  PANEL_MEMBER_STATUSES
);
export const locationKindEnum = pgEnum('location_kind', LOCATION_KINDS);
export const bookingTokenStatusEnum = pgEnum(
  'booking_token_status',
  BOOKING_TOKEN_STATUSES
);
export const emailKindEnum = pgEnum('email_kind', EMAIL_KINDS);
export const emailStatusEnum = pgEnum('email_status', EMAIL_STATUSES);
export const notificationKindEnum = pgEnum('notification_kind', NOTIFICATION_KINDS);

// Which founders are part of the interviewer pool (scheduling only — NOT a
// permission/role). A missing row means "is an interviewer" (default true).
export const interviewerSettings = pgTable('interviewer_settings', {
  id: serial('id').primaryKey(),
  founderId: text('founder_id').notNull().unique(),
  isInterviewer: boolean('is_interviewer').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Recurring weekly availability. Minutes-from-midnight in the company timezone
// (config COMPANY_TZ) — wall-clock, so it survives DST. founderId is a FOUNDERS
// id (text, no FK, matching candidates.owner / feedback.byFounder).
export const interviewerAvailability = pgTable(
  'interviewer_availability',
  {
    id: serial('id').primaryKey(),
    founderId: text('founder_id').notNull(),
    weekday: integer('weekday').notNull(), // 0=Sun … 6=Sat
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    weekdayRange: check('weekday_range', sql`${t.weekday} between 0 and 6`),
    minuteRange: check(
      'minute_range',
      sql`${t.startMinute} >= 0 and ${t.endMinute} <= 1440 and ${t.startMinute} < ${t.endMinute}`
    )
  })
);

// One-off overrides on the weekly pattern: PTO ('busy') or extra hours
// ('available'). Concrete UTC instants.
export const availabilityExceptions = pgTable(
  'availability_exceptions',
  {
    id: serial('id').primaryKey(),
    founderId: text('founder_id').notNull(),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    kind: text('kind').notNull().default('busy'), // 'busy' | 'available'
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    span: check('exception_span', sql`${t.endsAt} > ${t.startsAt}`)
  })
);

// A single interview event. `pending_booking` rows have null times until a
// candidate self-books (Phase 2). jobId is denormalized for calendar filtering.
export const interviews = pgTable('interviews', {
  id: serial('id').primaryKey(),
  candidateId: integer('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  jobId: integer('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  type: interviewTypeEnum('type').notNull().default('interview'),
  status: interviewStatusEnum('status').notNull().default('pending_booking'),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  durationMin: integer('duration_min').notNull().default(45),
  bufferMin: integer('buffer_min').notNull().default(15),
  locationKind: locationKindEnum('location_kind').notNull().default('video'),
  locationDetail: text('location_detail').notNull().default(''),
  // Candidate stage when booked — lets the touchpoint projection ignore
  // interviews that belong to a stage the candidate has since left.
  stageAtBooking: text('stage_at_booking'),
  createdBy: text('created_by'),
  rescheduledFromId: integer('rescheduled_from_id'),
  cancelReason: text('cancel_reason').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Interviewers on an interview (many-to-one). founderId is a FOUNDERS id.
export const interviewPanel = pgTable(
  'interview_panel',
  {
    id: serial('id').primaryKey(),
    interviewId: integer('interview_id')
      .notNull()
      .references(() => interviews.id, { onDelete: 'cascade' }),
    founderId: text('founder_id').notNull(),
    role: panelRoleEnum('role').notNull().default('interviewer'),
    memberStatus: panelMemberStatusEnum('member_status')
      .notNull()
      .default('invited'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (t) => ({
    oneRowPerInterviewer: unique('panel_interview_founder').on(
      t.interviewId,
      t.founderId
    )
  })
);

// Public self-scheduling capability (Phase 2). The token is the /book/[token]
// URL segment — single-use, expiring, revocable.
export const bookingTokens = pgTable('booking_tokens', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),
  candidateId: integer('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  interviewId: integer('interview_id').references(() => interviews.id, {
    onDelete: 'cascade'
  }),
  status: bookingTokenStatusEnum('status').notNull().default('active'),
  candidateTz: text('candidate_tz'),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Composed outbound emails + reminder queue (Phase 2). The default 'outbox'
// transport leaves rows queued and surfaces them in-app.
export const emailOutbox = pgTable('email_outbox', {
  id: serial('id').primaryKey(),
  kind: emailKindEnum('kind').notNull(),
  status: emailStatusEnum('status').notNull().default('queued'),
  toEmail: text('to_email').notNull(),
  toName: text('to_name').notNull().default(''),
  subject: text('subject').notNull(),
  bodyText: text('body_text').notNull(),
  bodyHtml: text('body_html').notNull().default(''),
  icsContent: text('ics_content'),
  candidateId: integer('candidate_id').references(() => candidates.id, {
    onDelete: 'set null'
  }),
  interviewId: integer('interview_id').references(() => interviews.id, {
    onDelete: 'set null'
  }),
  bookingToken: text('booking_token'),
  transport: text('transport').notNull().default('outbox'),
  providerId: text('provider_id'),
  error: text('error').notNull().default(''),
  sendAfter: timestamp('send_after'),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// In-app notification to a candidate's owner (recipientFounderId). dedupeKey
// keeps warnings to one row per candidate+kind; a schedule event is unique per
// interview — insert with onConflictDoNothing on this key.
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  recipientFounderId: text('recipient_founder_id').notNull(),
  candidateId: integer('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  kind: notificationKindEnum('kind').notNull(),
  message: text('message').notNull(),
  dedupeKey: text('dedupe_key').notNull().unique(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export type SelectInterviewerSettings = typeof interviewerSettings.$inferSelect;
export type SelectInterviewerAvailability =
  typeof interviewerAvailability.$inferSelect;
export type SelectAvailabilityException =
  typeof availabilityExceptions.$inferSelect;
export type SelectInterview = typeof interviews.$inferSelect;
export type SelectInterviewPanel = typeof interviewPanel.$inferSelect;
export type SelectBookingToken = typeof bookingTokens.$inferSelect;
export type SelectEmailOutbox = typeof emailOutbox.$inferSelect;
export type SelectNotification = typeof notifications.$inferSelect;

export const interviewsRelations = relations(interviews, ({ one, many }) => ({
  candidate: one(candidates, {
    fields: [interviews.candidateId],
    references: [candidates.id]
  }),
  job: one(jobs, { fields: [interviews.jobId], references: [jobs.id] }),
  panel: many(interviewPanel)
}));

export const interviewPanelRelations = relations(interviewPanel, ({ one }) => ({
  interview: one(interviews, {
    fields: [interviewPanel.interviewId],
    references: [interviews.id]
  })
}));
