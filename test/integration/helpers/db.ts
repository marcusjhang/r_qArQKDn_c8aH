// Integration-test database harness: an isolated client plus the isolation
// primitives every DB test builds on.
//
// Two isolation strategies, matched to how safe the target database is:
//   - `withRollback` — runs the body inside a transaction that is ALWAYS rolled
//     back, so nothing the test writes is ever committed. Safe even against the
//     shared dev database (`DATABASE_URL`), which is why it is the default.
//   - `resetTables` — TRUNCATE … RESTART IDENTITY, for tests that need real
//     committed state. Destructive, so it REFUSES to run unless a dedicated
//     `TEST_DATABASE_URL` is configured (see test/env.ts) — it can never wipe a
//     database the harness merely fell back to.
//
// The client is built with `createDb` (lib/db.ts) against the resolved test
// connection string, so DB access is exercised without the app's module-level
// `DATABASE_URL` singleton.

import { sql } from 'drizzle-orm';
import { createDb } from '@/lib/db';
import { testEnv } from '../../env';

type TestDb = ReturnType<typeof createDb>;
/** The transaction handle Drizzle passes to `db.transaction(cb)`. */
export type TestTx = Parameters<Parameters<TestDb['transaction']>[0]>[0];

let client: TestDb | undefined;

/**
 * The shared integration client (one per worker; `max: 1` so a single
 * connection serializes the rollback transactions). Throws if no database is
 * configured — callers should gate on `hasTestDatabase` first.
 */
export function testDb(): TestDb {
  if (!testEnv.databaseUrl) {
    throw new Error(
      'No test database configured. Set TEST_DATABASE_URL (preferred) or DATABASE_URL.'
    );
  }
  client ??= createDb(testEnv.databaseUrl, { max: 1 });
  return client;
}

/** Close the pooled connection. Call from an `afterAll` so the run can exit. */
export async function closeTestDb(): Promise<void> {
  if (client) {
    await client.$client.end();
    client = undefined;
  }
}

/** Sentinel used to force a rollback without surfacing as a test failure. */
class RollbackSignal extends Error {}

/**
 * Run `fn` inside a transaction that is always rolled back afterwards, giving
 * each call a clean, ephemeral slice of the database. The value `fn` returns is
 * passed back to the caller (assertions typically run inside `fn`, but returning
 * a read-back row is convenient too).
 */
export async function withRollback<T>(
  fn: (tx: TestTx) => Promise<T>
): Promise<T> {
  const db = testDb();
  let result: T;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      // Abort the transaction so nothing is committed. Caught below.
      throw new RollbackSignal();
    });
  } catch (err) {
    if (!(err instanceof RollbackSignal)) throw err;
  }
  return result!;
}

/**
 * TRUNCATE the given tables (RESTART IDENTITY, CASCADE) for a committed-state
 * clean slate. Destructive, so it only runs against a dedicated test database.
 * Table names are validated against a strict identifier pattern before being
 * interpolated, since they can't be bound as parameters in a TRUNCATE.
 */
export async function resetTables(tables: string[]): Promise<void> {
  if (!testEnv.hasDedicatedTestDatabase) {
    throw new Error(
      'resetTables is destructive and refuses to run without a dedicated ' +
        'TEST_DATABASE_URL. Point it at an isolated database, or use ' +
        'withRollback for non-destructive isolation against a shared one.'
    );
  }
  for (const t of tables) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(t)) {
      throw new Error(`Refusing to TRUNCATE unsafe table identifier: ${t}`);
    }
  }
  const list = tables.map((t) => `"${t}"`).join(', ');
  await testDb().execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
}
