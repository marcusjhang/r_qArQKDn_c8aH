import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Saved signed-in browser state produced by the `setup` project
// (test/e2e/global.setup.ts) and loaded by the authenticated `chromium`
// project. Reusing it means specs never re-drive the login form, so the per-IP
// login rate limiter (lib/rate-limit.ts) can't throttle a parallel run.
// (Playwright loads this config as CommonJS — `__dirname`, not import.meta.)
const STORAGE_STATE = path.join(__dirname, 'test', 'e2e', '.auth', 'user.json');

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
// The managed web server runs a PRODUCTION build (`bun run start`), and Auth.js
// v5 rejects requests on an untrusted Host in production (`UntrustedHost` — see
// errors.authjs.dev#untrustedhost), which would break every signed-in spec.
// Trust the localhost e2e origin here; the real deployment platform sets this in
// production. Kept alongside the optional DATABASE_URL override (both merge over
// the inherited process.env).
const webServerEnv = {
  AUTH_TRUST_HOST: 'true',
  ...(testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {})
};

export default defineConfig({
  testDir: './test/e2e',
  // Files run in parallel across workers, but tests WITHIN a file run serially.
  // Each spec file drives one shared seeded candidate (move → Marcus Webb, chat
  // → Ava Chen, feedback → Tom Alvarez) against the single e2e database, so
  // running a file's tests concurrently would let them mutate that candidate out
  // from under each other. Serial-within-file keeps each file deterministic;
  // distinct candidates keep the files safe to parallelize.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    // Runs once before the authenticated specs: signs in, completes the seeded
    // account's forced first-login password change, and saves the signed-in
    // cookies to STORAGE_STATE (see test/e2e/global.setup.ts). Matched by name
    // (global.setup.ts is not a *.spec.ts file, so only this project runs it).
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      // Authenticated happy-path specs: load the shared signed-in state instead
      // of logging in per-test. Excludes auth.spec.ts, which must be a guest.
      name: 'chromium',
      testIgnore: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup']
    },
    {
      // The auth-gate smoke tests assert UNauthenticated behaviour (redirect to
      // /login), so they run with no stored session and don't need `setup`.
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
        // Inherits the ambient env; overrides DATABASE_URL only when a dedicated
        // TEST_DATABASE_URL is configured (see above).
        env: webServerEnv
      }
});
