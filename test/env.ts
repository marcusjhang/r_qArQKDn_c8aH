// Structured, read-once view of the test environment: env inputs are resolved
// HERE, once, into a typed object rather than read from `process.env` ad hoc.
// `readTestEnv` is pure so a test can build an override object explicitly.

export interface TestEnv {
  /**
   * Connection string for integration tests. Prefers a DEDICATED
   * `TEST_DATABASE_URL`, falling back to `DATABASE_URL` (rollback-only — see
   * `hasDedicatedTestDatabase`).
   */
  databaseUrl?: string;
  /**
   * True only when a dedicated `TEST_DATABASE_URL` is configured. Destructive
   * cleanup (TRUNCATE) is gated on this so a fallback dev DB is never wiped.
   */
  hasDedicatedTestDatabase: boolean;
}

/** Resolve a {@link TestEnv} from an environment-like record (pure). */
export function readTestEnv(
  source: Record<string, string | undefined> = process.env
): TestEnv {
  const dedicated = source.TEST_DATABASE_URL?.trim();
  const fallback = source.DATABASE_URL?.trim();
  return {
    databaseUrl: dedicated || fallback || undefined,
    hasDedicatedTestDatabase: !!dedicated
  };
}

/** The resolved environment for this test run. */
export const testEnv: TestEnv = readTestEnv();

/** Whether any database is reachable; DB-dependent suites skipIf(!this). */
export const hasTestDatabase = !!testEnv.databaseUrl;
