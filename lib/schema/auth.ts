// Auth domain schema: the account and signup-allowlist tables that gate the
// app (see lib/auth.ts, lib/allowlist.ts, lib/registration.ts). The app has no
// roles — access is authentication-only: any account can sign in and use it.

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
  // The account's name, stored as discrete parts and editable from /settings.
  // The display name and avatar initials are derived from these (never stored):
  // see lib/hiring/helpers.ts `displayName` / `initials`.
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

// Per-user API tokens for the MCP layer (see app/api/mcp/route.ts). A token lets
// Claude Code drive the board over MCP acting as its owning user. The plaintext
// secret is shown exactly once at creation and never persisted — only a SHA-256
// hash (for verification) and a short display prefix are stored, so a DB leak
// never exposes a live secret. Revocation is a row delete; an optional
// `expiresAt` gives rotation without forcing it on everyone.
export const apiTokens = pgTable('api_tokens', {
  id: serial('id').primaryKey(),
  // The owning account — every MCP write authenticated by this token acts as
  // this user. Cascades away with the account.
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Human label chosen at creation (e.g. "my-laptop").
  name: text('name').notNull(),
  // SHA-256 hex digest of the plaintext secret — never the secret itself.
  // Unique so a verify is a single indexed lookup.
  tokenHash: text('token_hash').notNull().unique(),
  // First characters of the secret, kept for display (e.g. `hpt_live_a1b2`).
  prefix: text('prefix').notNull(),
  // Bumped on each authenticated call; null until first used.
  lastUsedAt: timestamp('last_used_at'),
  // Optional expiry; null means the token never expires.
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});
