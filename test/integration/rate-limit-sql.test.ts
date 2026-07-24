import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { hasTestDatabase } from '../env';
import { withRollback, closeTestDb, type TestTx } from './helpers/db';

// Exercises the REAL Postgres `rate_limit_hit()` function behind
// PostgresRateLimitStore (the unit tests cover the in-memory reference impl;
// this confirms the SQL it delegates to in production matches). All hits run
// inside a rolled-back transaction, so the rows never persist.

interface Row {
  allowed: boolean;
  remaining: number;
  retry_after_ms: number;
}

/** One call to the SQL limiter for `key`, marshalled like the app's executor. */
async function hit(
  tx: TestTx,
  key: string,
  limit: number,
  windowMs: number,
  now: number
): Promise<Row> {
  const rows = (await tx.execute(
    sql`SELECT allowed, remaining, retry_after_ms
        FROM rate_limit_hit(${key}, ${limit}, ${windowMs}, ${now})`
  )) as unknown as Row[];
  const r = rows[0]!;
  return {
    allowed: r.allowed,
    remaining: Number(r.remaining),
    retry_after_ms: Number(r.retry_after_ms)
  };
}

describe.skipIf(!hasTestDatabase)('rate_limit_hit() SQL function', () => {
  afterAll(closeTestDb);

  it('allows hits up to the limit, then blocks', async () => {
    await withRollback(async (tx) => {
      const key = 'test:allow-then-block';
      expect((await hit(tx, key, 3, 1000, 0)).allowed).toBe(true);
      expect((await hit(tx, key, 3, 1000, 0)).allowed).toBe(true);
      expect((await hit(tx, key, 3, 1000, 0)).allowed).toBe(true);
      const blocked = await hit(tx, key, 3, 1000, 0);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retry_after_ms).toBeGreaterThan(0);
    });
  });

  it('reports decreasing remaining counts', async () => {
    await withRollback(async (tx) => {
      const key = 'test:remaining';
      expect((await hit(tx, key, 3, 1000, 0)).remaining).toBe(2);
      expect((await hit(tx, key, 3, 1000, 0)).remaining).toBe(1);
      expect((await hit(tx, key, 3, 1000, 0)).remaining).toBe(0);
    });
  });

  it('frees the window once the oldest hit ages out', async () => {
    await withRollback(async (tx) => {
      const key = 'test:window-frees';
      await hit(tx, key, 2, 1000, 0);
      await hit(tx, key, 2, 1000, 0);
      expect((await hit(tx, key, 2, 1000, 0)).allowed).toBe(false);
      // Advance past the window: the two hits at t=0 have aged out.
      expect((await hit(tx, key, 2, 1000, 1001)).allowed).toBe(true);
    });
  });

  it('keys retryAfter off the oldest hit, not extended by blocked hits', async () => {
    await withRollback(async (tx) => {
      const key = 'test:retry-after';
      await hit(tx, key, 1, 1000, 0); // oldest hit at t=0
      const first = await hit(tx, key, 1, 1000, 400);
      expect(first.retry_after_ms).toBe(600); // 0 + 1000 - 400
      // A second blocked hit must not push the window forward: still keyed off 0.
      const second = await hit(tx, key, 1, 1000, 500);
      expect(second.retry_after_ms).toBe(500); // 0 + 1000 - 500
    });
  });

  it('tracks distinct keys independently', async () => {
    await withRollback(async (tx) => {
      expect((await hit(tx, 'test:key-a', 1, 1000, 0)).allowed).toBe(true);
      expect((await hit(tx, 'test:key-b', 1, 1000, 0)).allowed).toBe(true);
      expect((await hit(tx, 'test:key-a', 1, 1000, 0)).allowed).toBe(false);
    });
  });
});
