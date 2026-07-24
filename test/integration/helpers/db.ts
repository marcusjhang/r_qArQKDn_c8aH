// Integration-test database harness: an isolated `createDb` client plus two
// isolation strategies —
//   - `withRollback` — body runs in an ALWAYS-rolled-back transaction (nothing
//     committed), safe even against the shared dev DB; the default.
//   - `resetTables` — TRUNCATE for real committed state; destructive, so it
//     refuses to run without a dedicated `TEST_DATABASE_URL` (test/env.ts).

import { sql } from 'drizzle-orm';
import { createDb } from '@/lib/db';
import { testEnv } from '../../env';

type TestDb = ReturnType<typeof createDb>;
/** The transaction handle Drizzle passes to `db.transaction(cb)`. */
export type TestTx = Parameters<Parameters<TestDb['transaction']>[0]>[0];

let client: TestDb | undefined;

/**
 * The shared integration client (`max: 1` so one connection serializes the
 * rollback transactions). Throws if no database is configured.
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
 * Run `fn` inside an always-rolled-back transaction, giving each call a clean,
 * ephemeral slice of the database. `fn`'s return value is passed back.
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
 * Names are validated against a strict identifier pattern (can't be bound).
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
