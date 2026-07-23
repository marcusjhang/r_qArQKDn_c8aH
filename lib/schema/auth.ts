// Auth domain schema: the account and signup-allowlist tables that gate the
// app (see lib/auth.ts, lib/allowlist.ts, lib/registration.ts). The app has no
// roles — access is authentication-only: any account can sign in and use it.

import {
  pgTable,
  text,
  timestamp,
  serial,
  varchar,
  boolean
} from 'drizzle-orm/pg-core';

// Auth accounts (used by lib/auth.ts to gate the app).
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  // The account's name, stored as discrete parts and editable from /settings.
  // The display name and avatar initials are derived from these (never stored):
  // see lib/hiring/helpers `displayName` / `initials`.
  firstName: varchar('first_name', { length: 50 }),
  lastName: varchar('last_name', { length: 50 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // When true the account must set a new password before it can use the app.
  // Seeded accounts start with the shared default password (see db/seed.ts +
  // SECURITY.md), so the seed sets this true and the /change-password flow
  // clears it — the middleware gate in lib/auth.ts redirects there until then.
  mustChangePassword: boolean('must_change_password').notNull().default(false),
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
