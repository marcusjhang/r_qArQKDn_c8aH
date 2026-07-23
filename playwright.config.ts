import { defineConfig, devices } from '@playwright/test';

// End-to-end config. Specs live in `test/e2e`. By default Playwright boots the
// app itself via the `webServer` block (production build on port 3000); set
// PLAYWRIGHT_BASE_URL to point at an already-running instance and the managed
// server is skipped. Running these requires a database and, once, the browser
// binaries: `bunx playwright install`.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// Database isolation for the managed server: when TEST_DATABASE_URL is set, the
// app Playwright boots is pointed at that dedicated database instead of the dev
// DATABASE_URL, so e2e runs never mutate development data. Mirrors the unit /
// integration precedence in test/env.ts. (Ignored when PLAYWRIGHT_BASE_URL is
// set, since then Playwright doesn't manage the server.)
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const webServerEnv = testDatabaseUrl
  ? { DATABASE_URL: testDatabaseUrl }
  : undefined;

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
        reuseExistingServer: !process.env.CI,
        // Inherits the ambient env; overrides DATABASE_URL only when a dedicated
        // TEST_DATABASE_URL is configured (see above).
        env: webServerEnv
      }
});
