// Structured, read-once view of the test environment.
//
// Tests must not read or mutate the global `process.env` ad hoc (that shared,
// mutable state is exactly the coupling that makes suites order-dependent and
// hard to reason about). Instead, environment inputs are resolved HERE, once,
// into a typed object, and `readTestEnv` is exported as a pure function so a
// test can also build an override object explicitly without touching the real
// environment. See test/README.md → "Test environment".

export interface TestEnv {
  /**
   * Connection string for integration tests. Prefers a DEDICATED test database
   * (`TEST_DATABASE_URL`) and falls back to `DATABASE_URL` so the harness still
   * runs in a dev sandbox — but only rollback-isolated work is allowed against a
   * non-dedicated database (see `hasDedicatedTestDatabase`).
   */
  databaseUrl?: string;
  /**
   * True only when a dedicated `TEST_DATABASE_URL` is configured. Destructive
   * cleanup (TRUNCATE) is gated on this so the harness can never wipe a shared
   * dev database it merely fell back to.
   */
  hasDedicatedTestDatabase: boolean;
}

/**
 * Resolve a {@link TestEnv} from an environment-like record. Pure: pass a plain
 * object to model a specific environment in a test; defaults to `process.env`
 * for the real run.
 */
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

/**
 * Whether any database is reachable for integration tests. DB-dependent suites
 * `describe.skipIf(!hasTestDatabase)` so the pure unit suite (and CI without a
 * database) stays green.
 */
export const hasTestDatabase = !!testEnv.databaseUrl;
