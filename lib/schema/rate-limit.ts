// Rate-limit backing store: one row per limiter key, holding a sliding-window log
// of epoch-ms hit timestamps. Shared across all instances so the limit is global.
// The window logic lives in the hand-authored `rate_limit_hit()` SQL function
// (drizzle-kit can't emit functions), so this table is the only part it generates.

import { pgTable, text, bigint } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const rateLimitHits = pgTable('rate_limit_hits', {
  // The limiter key, already namespaced by its caller (login/register, ip/email).
  key: text('key').primaryKey(),
  // Sliding-window log of epoch-ms hit timestamps, pruned on every check.
  hits: bigint('hits', { mode: 'number' })
    .array()
    .notNull()
    .default(sql`ARRAY[]::bigint[]`),
  // Epoch-ms of the most recent check; supports optional stale-row cleanup.
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
});

export type SelectRateLimitHit = typeof rateLimitHits.$inferSelect;
