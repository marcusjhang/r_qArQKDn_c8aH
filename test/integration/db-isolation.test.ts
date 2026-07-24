import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { allowedEmails } from '@/lib/db';
import { hasTestDatabase } from '../env';
import {
  testDb,
  closeTestDb,
  withRollback,
  resetTables
} from './helpers/db';

// Proves the isolation harness itself: writes inside `withRollback` are never
// committed, so tests can touch a real DB without leaving state behind.

const PROBE_EMAIL = '__iso_probe__@example.test';

describe.skipIf(!hasTestDatabase)('withRollback isolation', () => {
  afterAll(closeTestDb);

  it('sees its own writes inside the transaction', async () => {
    const seen = await withRollback(async (tx) => {
      await tx.insert(allowedEmails).values({ email: PROBE_EMAIL });
      const rows = await tx
        .select({ email: allowedEmails.email })
        .from(allowedEmails)
        .where(eq(allowedEmails.email, PROBE_EMAIL));
      return rows.length;
    });
    expect(seen).toBe(1);
  });

  it('rolls those writes back — nothing is committed', async () => {
    // A fresh (non-transactional) read must not find the row the previous test
    // inserted: the transaction was rolled back, so the database is untouched.
    const rows = await testDb()
      .select({ email: allowedEmails.email })
      .from(allowedEmails)
      .where(eq(allowedEmails.email, PROBE_EMAIL));
    expect(rows).toHaveLength(0);
  });

  it('rethrows real errors (rollback signal is not swallowed as a pass)', async () => {
    await expect(
      withRollback(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});

describe.skipIf(!hasTestDatabase)('allowed_emails uniqueness (schema constraint)', () => {
  afterAll(closeTestDb);

  it('rejects a duplicate email via the unique constraint', async () => {
    await expect(
      withRollback(async (tx) => {
        await tx.insert(allowedEmails).values({ email: PROBE_EMAIL });
        await tx.insert(allowedEmails).values({ email: PROBE_EMAIL });
      })
    ).rejects.toThrow();
  });
});

describe.skipIf(!hasTestDatabase)('resetTables safety gate', () => {
  it('refuses destructive TRUNCATE without a dedicated TEST_DATABASE_URL', async () => {
    // A borrowed DATABASE_URL is fine for rollback work but must never be
    // TRUNCATEd. (With a real TEST_DATABASE_URL this test does not assert.)
    const { hasDedicatedTestDatabase } = (await import('../env')).testEnv;
    if (hasDedicatedTestDatabase) return;
    await expect(resetTables(['allowed_emails'])).rejects.toThrow(
      /dedicated/i
    );
  });
});
