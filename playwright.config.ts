import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Saved signed-in state (from the `setup` project) reused by the `chromium`
// project so specs never re-drive login and trip the per-IP rate limiter.
// (Playwright loads this config as CommonJS — `__dirname`, not import.meta.)
const STORAGE_STATE = path.join(__dirname, 'test', 'e2e', '.auth', 'user.json');

// Playwright boots the app itself (production build) unless PLAYWRIGHT_BASE_URL
// points at an already-running instance, which skips the managed server.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// When set, point the managed server at a dedicated test database so e2e runs
// never mutate dev data (ignored when PLAYWRIGHT_BASE_URL manages the server).
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
// The managed server runs a PROD build, and Auth.js v5 rejects an untrusted Host
// in production (`UntrustedHost`) — trust the localhost e2e origin here.
const webServerEnv = {
  AUTH_TRUST_HOST: 'true',
  ...(testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {})
};

export default defineConfig({
  testDir: './test/e2e',
  // Files parallelize across workers, but tests WITHIN a file run serially: each
  // file drives its own shared seeded candidate, so concurrent tests in one file
  // would mutate that candidate out from under each other.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    // Runs once before the authenticated specs: signs in, clears the forced
    // first-login password change, and saves the cookies to STORAGE_STATE.
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      // Authenticated happy-path specs load the shared session; auth.spec.ts is
      // excluded (it must be a guest).
      name: 'chromium',
      testIgnore: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup']
    },
    {
      // Auth-gate smoke tests assert UNauthenticated behaviour, so no `setup`.
      name: 'guest',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'bun run build && bun run start',
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        // Overrides DATABASE_URL only when a dedicated TEST_DATABASE_URL is set.
        env: webServerEnv
      }
});
