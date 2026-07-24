import { test as setup, expect } from '@playwright/test';
import path from 'node:path';

// One-time e2e authentication: sign in once, clear the forced first-login
// password change, and save the cookies for the specs to reuse. Necessary
// because seeded accounts are flagged `must_change_password` (confined to
// /change-password until cleared), and the login endpoint is per-IP
// rate-limited — so reusing one session keeps a parallel run under the limit.
const E2E_EMAIL = process.env.E2E_EMAIL ?? 'marcusajh0802@gmail.com';
// The seeded default the account starts on...
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'password';
// ...and the distinct value we migrate it to (the forced-change service rejects
// re-setting the same password). Kept in sync with the `login` helper.
const E2E_NEW_PASSWORD = process.env.E2E_NEW_PASSWORD ?? 'e2e-changed-pw-9f3a';

// Must match STORAGE_STATE in playwright.config.ts. (Playwright loads test
// files as CommonJS — `__dirname`, not import.meta.)
const STORAGE_STATE = path.join(__dirname, '.auth', 'user.json');

setup('authenticate and clear forced password change', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(E2E_EMAIL);
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // On success we leave /login; the gate then sends a flagged account to
  // /change-password. On a re-run the seed default fails, so retry with the new
  // password to stay idempotent.
  await page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 8000 })
    .catch(() => {});
  if (new URL(page.url()).pathname === '/login') {
    await page.getByPlaceholder('Password').fill(E2E_NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  }

  if (new URL(page.url()).pathname === '/change-password') {
    // Exact match: getByPlaceholder is a substring match, so a bare 'New
    // password' would also hit the 'Confirm new password' field.
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
