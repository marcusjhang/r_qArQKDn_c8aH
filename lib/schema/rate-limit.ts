// Rate-limit backing store. This is shared infrastructure (not the auth or
// hiring domain): one row per limiter key (e.g. "login:ip:1.2.3.4"), holding a
// sliding-window log of epoch-millisecond hit timestamps in `hits`. All app
// instances read/write this one table, so the limit is global across instances
// and serverless invocations rather than per-process (see lib/rate-limit.ts
// `PostgresRateLimitStore`).
//
// The window logic itself lives in the hand-authored `rate_limit_hit()` SQL
// function (see the migration) so the prune/decide/append is atomic under a
// per-key row lock — drizzle-kit cannot emit functions, so this table is the
// only part it generates.

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
