// Auth domain schema: the account and signup-allowlist tables that gate the
// app (see lib/auth.ts, lib/allowlist.ts, lib/registration.ts). The app has no
// roles — access is authentication-only: any account can sign in and use it.

import { pgTable, text, timestamp, serial, varchar } from 'drizzle-orm/pg-core';

// Auth accounts (used by lib/auth.ts to gate the app).
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  // Discrete first/last names, editable from /settings. `name` is the combined
  // display value kept in sync on edit; avatar initials derive from it (first
  // word + last word) — see lib/hiring/helpers.ts `initials`.
  firstName: varchar('first_name', { length: 50 }),
  lastName: varchar('last_name', { length: 50 }),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export type SelectUser = typeof users.$inferSelect;

// Emails permitted to sign up (enforced in /api/register, managed in /settings).
export const allowedEmails = pgTable('allowed_emails', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export type SelectAllowedEmail = typeof allowedEmails.$inferSelect;
