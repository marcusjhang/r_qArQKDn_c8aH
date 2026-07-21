import {
  pgTable,
  text,
  numeric,
  integer,
  timestamp,
  pgEnum,
  serial,
  varchar
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

export const roleEnum = pgEnum('role', ['user', 'admin']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').default('user').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export type SelectUser = typeof users.$inferSelect;

export const statusEnum = pgEnum('status', ['active', 'inactive', 'archived']);

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  imageUrl: text('image_url').notNull(),
  name: text('name').notNull(),
  status: statusEnum('status').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  stock: integer('stock').notNull(),
  availableAt: timestamp('available_at').notNull()
});

export type SelectProduct = typeof products.$inferSelect;
export const insertProductSchema = createInsertSchema(products);

/* ---------- Hiring Pipeline Tracker ---------- */

// Orthogonal candidate status (Decision 3). Stage is tracked separately.
export const candidateStatusEnum = pgEnum('candidate_status', [
  'active',
  'onhold',
  'rejected',
  'hired'
]);

// A job owns its own ordered, per-job stage list (Decision 1), stored as an
// ordered JSON array of stage names so candidates can key off the stage name.
export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  // Native text[] (not jsonb) — a real array, so it round-trips cleanly and
  // stays inspectable/queryable in SQL.
  stages: text('stages').array().notNull(),
  position: integer('position').notNull().default(0),
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
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// One entry per interviewer (Decision 7).
export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  candidateId: integer('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  // Founder id of the interviewer.
  byFounder: text('by_founder').notNull(),
  // 4-point verdict rating (1 = Strong No … 4 = Strong Yes).
  rating: integer('rating').notNull(),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export type SelectJob = typeof jobs.$inferSelect;
export type SelectCandidate = typeof candidates.$inferSelect;
export type SelectFeedback = typeof feedback.$inferSelect;
