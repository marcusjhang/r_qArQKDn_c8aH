// Auth domain schema: the account, allowlist, and API-token tables. The app has
// no roles — access is authentication-only: any account can sign in and use it.

import {
  pgTable,
  text,
  timestamp,
  serial,
  varchar,
  boolean,
  integer
} from 'drizzle-orm/pg-core';

// Auth accounts (used by lib/auth.ts to gate the app).
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  // Name stored as discrete parts; display name and initials are derived, never stored.
  firstName: varchar('first_name', { length: 50 }),
  lastName: varchar('last_name', { length: 50 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // When true the account must set a new password before using the app (seeded
  // accounts start on the shared default; the /change-password flow clears it).
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

// Per-user API tokens for the MCP layer — a token drives the board acting as its
// owning user. Only a SHA-256 hash and display prefix are stored (never the
// plaintext secret), so a DB leak never exposes a live secret; revocation is a row delete.
export const apiTokens = pgTable('api_tokens', {
  id: serial('id').primaryKey(),
  // The owning account every write acts as; cascades away with the account.
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Human label chosen at creation (e.g. "my-laptop").
  name: text('name').notNull(),
  // SHA-256 hex digest of the secret; unique so a verify is a single indexed lookup.
  tokenHash: text('token_hash').notNull().unique(),
  // First characters of the secret, kept for display (e.g. `hpt_live_a1b2`).
  prefix: text('prefix').notNull(),
  // Bumped on each authenticated call; null until first used.
  lastUsedAt: timestamp('last_used_at'),
  // Optional expiry; null means the token never expires.
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});
