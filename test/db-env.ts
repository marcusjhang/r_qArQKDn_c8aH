// Pure resolution of which Postgres database the Playwright E2E suite should
// target. The E2E specs MUTATE data (they register accounts, move candidates,
// write feedback, and edit settings), so pointing them at a shared team dev
// database silently clobbers other developers' data. This helper formalizes the
// isolation convention across environments:
//
//   - Set `TEST_DATABASE_URL` (typically in a git-ignored `.env.test`) to a
//     dedicated, disposable database. The suite runs against it.
//   - If `TEST_DATABASE_URL` is unset, the suite REFUSES to run rather than
//     falling back to `DATABASE_URL` (the dev DB) by accident.
//   - If `TEST_DATABASE_URL` equals `DATABASE_URL`, that is almost certainly a
//     misconfiguration, so it is likewise refused.
//   - `ALLOW_SHARED_TEST_DB=1` is an explicit, opt-in escape hatch for the
//     single-database case (e.g. a throwaway local sandbox or an ephemeral CI
//     container where the dev and test DB are intentionally the same).
//
// Kept as a pure function (inputs in, string out or throw) with no `process.env`
// / filesystem access of its own so it is unit-tested directly; `playwright.config.ts`
// reads the environment and passes the values in.

/** Raw environment inputs the resolution depends on. */
export interface TestDbEnv {
  /** The dedicated test database URL (`TEST_DATABASE_URL`). */
  testDatabaseUrl?: string;
  /** The app/dev database URL (`DATABASE_URL`). */
  databaseUrl?: string;
  /** Explicit opt-in to run against the dev DB (`ALLOW_SHARED_TEST_DB`). */
  allowSharedDatabase?: boolean;
}

/**
 * Thrown when no isolated test database is configured and the caller has not
 * explicitly opted into sharing the dev database. A distinct class so callers
 * (and tests) can assert on the failure without string-matching the message.
 */
export class TestDatabaseIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestDatabaseIsolationError';
  }
}

/**
 * Resolve the database URL the E2E suite should use, enforcing isolation from
 * the dev database. Returns the URL to use, or throws
 * `TestDatabaseIsolationError` when running would risk a shared/dev database.
 */
export function resolveTestDatabaseUrl(env: TestDbEnv): string {
  const testUrl = env.testDatabaseUrl?.trim();
  const devUrl = env.databaseUrl?.trim();
  const allowShared = env.allowSharedDatabase === true;

  if (testUrl) {
    if (!allowShared && devUrl && testUrl === devUrl) {
      throw new TestDatabaseIsolationError(
        'TEST_DATABASE_URL must not equal DATABASE_URL — the E2E suite mutates ' +
          'data and would clobber the dev database. Point TEST_DATABASE_URL at a ' +
          'dedicated, disposable database, or set ALLOW_SHARED_TEST_DB=1 to ' +
          'intentionally run against the same database.'
      );
    }
    return testUrl;
  }

  // No dedicated test database configured.
  if (allowShared) {
    if (devUrl) return devUrl;
    throw new TestDatabaseIsolationError(
      'ALLOW_SHARED_TEST_DB is set but neither TEST_DATABASE_URL nor DATABASE_URL ' +
        'is configured — there is no database to run the E2E suite against.'
    );
  }

  throw new TestDatabaseIsolationError(
    'No isolated test database configured. Set TEST_DATABASE_URL (e.g. in a ' +
      'git-ignored .env.test) to a dedicated, disposable database, or set ' +
      'ALLOW_SHARED_TEST_DB=1 to run against DATABASE_URL on purpose. See ' +
      'test/README.md → "Test database isolation".'
  );
}

/** Truthy-string parser for boolean env vars (`1`/`true`, case-insensitive). */
export function parseBooleanEnv(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((value ?? '').trim());
}
