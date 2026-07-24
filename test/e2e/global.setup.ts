import { test as setup, expect } from '@playwright/test';
import path from 'node:path';

// One-time e2e authentication: sign in once, clear the forced first-login
// password change, and save the signed-in cookies for the specs to reuse.
//
// Two seeded-account facts make this necessary:
//   1. Seeded accounts share a default password and are flagged
//      `must_change_password` (db/seed.ts), so the auth gate
//      (lib/auth-policy.ts `evaluateAccess`) confines them to /change-password
//      until they set their own. We complete that change here (the DB flag is
//      then cleared for the account) before any spec runs.
//   2. The login endpoint is rate-limited per IP (lib/rate-limit.ts: 10
//      attempts / 5 min). Signing in once here and reusing `storageState` keeps
//      a parallel spec run from tripping that limit.
//
// Credentials mirror the seeded accounts. The target password defaults to the
// seed default ('password'); the change-password service allows setting the
// same value (lib/password.ts) and only clears the flag, so re-running against
// an already-cleared account is a no-op.
const E2E_EMAIL = process.env.E2E_EMAIL ?? 'marcusajh0802@gmail.com';
// The seeded default the account starts on...
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'password';
// ...and the distinct value we migrate it to. The forced-change service rejects
// re-setting the same password (lib/password.ts), so the new one must differ
// from E2E_PASSWORD. Kept in sync with the `login` helper.
const E2E_NEW_PASSWORD = process.env.E2E_NEW_PASSWORD ?? 'e2e-changed-pw-9f3a';

// Must match STORAGE_STATE in playwright.config.ts. (Playwright loads test
// files as CommonJS — `__dirname`, not import.meta.)
const STORAGE_STATE = path.join(__dirname, '.auth', 'user.json');

setup('authenticate and clear forced password change', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(E2E_EMAIL);
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // useLoginForm redirects off /login on success; the gate then sends a
  // still-flagged account to /change-password. On a re-run where this account
  // was already migrated, the seed default no longer works and we stay on
  // /login — retry with the new password so the setup is idempotent.
  await page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 8000 })
    .catch(() => {});
  if (new URL(page.url()).pathname === '/login') {
    await page.getByPlaceholder('Password').fill(E2E_NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  }

  if (new URL(page.url()).pathname === '/change-password') {
    // Exact match: getByPlaceholder is a case-insensitive substring match, so a
    // bare 'New password' would also match the 'Confirm new password' field.
    // Must differ from the current password (the forced-change service rejects
    // re-setting the same value).
    await page
      .getByPlaceholder('New password', { exact: true })
      .fill(E2E_NEW_PASSWORD);
    await page.getByPlaceholder('Confirm new password').fill(E2E_NEW_PASSWORD);
    await page.getByRole('button', { name: 'Change password' }).click();
  }

  // With the flag cleared, the account reaches the board — assert the same
  // toolbar control the `loginToBoard` helper waits on.
  await expect(
    page.getByRole('button', { name: /Add candidate/ })
  ).toBeVisible();

  // Persist the signed-in cookies for the authenticated `chromium` project.
  await page.context().storageState({ path: STORAGE_STATE });
});
