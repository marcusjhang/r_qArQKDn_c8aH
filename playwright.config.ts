import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { resolveTestDatabaseUrl, parseBooleanEnv } from './test/db-env';

// End-to-end config. Specs live in `test/e2e`. By default Playwright boots the
// app itself via the `webServer` block (production build on port 3000); set
// PLAYWRIGHT_BASE_URL to point at an already-running instance and the managed
// server is skipped. Running these requires a database and, once, the browser
// binaries: `bunx playwright install`.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// Test database isolation. When Playwright manages the app itself, the E2E
// specs mutate data, so they must run against a DEDICATED database rather than
// whatever `DATABASE_URL` is in `.env` (which on a team is often a shared dev
// DB). Load `.env.test` (git-ignored) over `.env`, then resolve the test DB via
// the pure helper, which refuses to run against the dev DB unless
// ALLOW_SHARED_TEST_DB is set. The resolved URL is exported to the managed
// server subprocess via `process.env.DATABASE_URL`. When PLAYWRIGHT_BASE_URL is
// set we don't own the server (and thus its database), so this is skipped.
// See test/README.md → "Test database isolation".
if (!process.env.PLAYWRIGHT_BASE_URL) {
  loadEnv({ path: '.env' });
  loadEnv({ path: '.env.test', override: true });
  process.env.DATABASE_URL = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    allowSharedDatabase: parseBooleanEnv(process.env.ALLOW_SHARED_TEST_DB)
  });
}

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'bun run build && bun run start',
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI
      }
});
