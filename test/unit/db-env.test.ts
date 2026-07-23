import { describe, it, expect } from 'vitest';
import {
  resolveTestDatabaseUrl,
  parseBooleanEnv,
  TestDatabaseIsolationError
} from '../db-env';

// The E2E suite mutates data, so it must never run against the shared dev
// database by accident. `resolveTestDatabaseUrl` is the pure guard that
// enforces that convention across team environments; these tests pin the
// isolation contract, including the awkward misconfiguration paths.

const DEV = 'postgres://dev/app';
const TEST = 'postgres://test/app_test';

describe('resolveTestDatabaseUrl — dedicated test DB', () => {
  it('uses TEST_DATABASE_URL when it differs from the dev DB', () => {
    expect(
      resolveTestDatabaseUrl({ testDatabaseUrl: TEST, databaseUrl: DEV })
    ).toBe(TEST);
  });

  it('uses TEST_DATABASE_URL even when DATABASE_URL is unset', () => {
    expect(resolveTestDatabaseUrl({ testDatabaseUrl: TEST })).toBe(TEST);
  });

  it('trims surrounding whitespace on the resolved URL', () => {
    expect(
      resolveTestDatabaseUrl({ testDatabaseUrl: `  ${TEST}  ` })
    ).toBe(TEST);
  });
});

describe('resolveTestDatabaseUrl — isolation guardrails', () => {
  it('refuses when TEST_DATABASE_URL equals DATABASE_URL', () => {
    expect(() =>
      resolveTestDatabaseUrl({ testDatabaseUrl: DEV, databaseUrl: DEV })
    ).toThrow(TestDatabaseIsolationError);
  });

  it('treats whitespace-only differences as equal (still refuses)', () => {
    expect(() =>
      resolveTestDatabaseUrl({ testDatabaseUrl: `  ${DEV}  `, databaseUrl: DEV })
    ).toThrow(TestDatabaseIsolationError);
  });

  it('refuses when no test DB is configured and sharing is not allowed', () => {
    expect(() => resolveTestDatabaseUrl({ databaseUrl: DEV })).toThrow(
      TestDatabaseIsolationError
    );
    expect(() => resolveTestDatabaseUrl({})).toThrow(
      TestDatabaseIsolationError
    );
  });

  it('treats an empty / whitespace-only TEST_DATABASE_URL as unset', () => {
    expect(() =>
      resolveTestDatabaseUrl({ testDatabaseUrl: '   ', databaseUrl: DEV })
    ).toThrow(TestDatabaseIsolationError);
  });
});

describe('resolveTestDatabaseUrl — ALLOW_SHARED_TEST_DB escape hatch', () => {
  it('permits TEST_DATABASE_URL === DATABASE_URL when explicitly allowed', () => {
    expect(
      resolveTestDatabaseUrl({
        testDatabaseUrl: DEV,
        databaseUrl: DEV,
        allowSharedDatabase: true
      })
    ).toBe(DEV);
  });

  it('falls back to DATABASE_URL when allowed and no test DB is set', () => {
    expect(
      resolveTestDatabaseUrl({ databaseUrl: DEV, allowSharedDatabase: true })
    ).toBe(DEV);
  });

  it('still throws when allowed but there is no database at all', () => {
    expect(() =>
      resolveTestDatabaseUrl({ allowSharedDatabase: true })
    ).toThrow(TestDatabaseIsolationError);
  });
});

describe('parseBooleanEnv', () => {
  it('is true for 1/true/yes/on (case-insensitive)', () => {
    for (const v of ['1', 'true', 'TRUE', 'Yes', 'on']) {
      expect(parseBooleanEnv(v)).toBe(true);
    }
  });

  it('is false for undefined, empty, and other values', () => {
    for (const v of [undefined, '', '0', 'false', 'no', 'nope']) {
      expect(parseBooleanEnv(v)).toBe(false);
    }
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseBooleanEnv('  1  ')).toBe(true);
  });
});
