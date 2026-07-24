import { expect, type Page } from '@playwright/test';

// Shared e2e helpers. Authentication happens ONCE in the `setup` project, whose
// cookies the `chromium` project loads via `storageState`, so specs start signed
// in and these helpers just confirm the session (avoiding the login rate limit).

/**
 * Confirm/establish an authenticated session. With no credentials, rely on the
 * shared pre-authenticated session. With an `email`/`password`, sign in as that
 * specific seeded user (dropping the shared session first) and clear its forced
 * first-login password change the way `global.setup.ts` does.
 */
export async function login(
  page: Page,
  email?: string,
  password?: string
): Promise<void> {
  if (!email || !password) {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
    return;
  }

  // The forced-change service rejects re-setting the same password, so migrate
  // to a distinct value. Idempotent: on a re-run the seed default fails, so
  // retry with the migrated one.
  const changed = `${password}-e2e-changed`;
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 8000 })
    .catch(() => {});
  if (new URL(page.url()).pathname === '/login') {
    await page.getByPlaceholder('Password').fill(changed);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  }

  if (new URL(page.url()).pathname === '/change-password') {
    await page.getByPlaceholder('New password', { exact: true }).fill(changed);
    await page.getByPlaceholder('Confirm new password').fill(changed);
    await page.getByRole('button', { name: 'Change password' }).click();
  }

  await expect(
    page.getByRole('button', { name: /Add candidate/ })
  ).toBeVisible();
}

/**
 * Land on the board (the dashboard home at '/'). Returns once the board's
 * toolbar (job title + "Add candidate") is visible.
 */
export async function loginToBoard(page: Page): Promise<void> {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: /Add candidate/ })
  ).toBeVisible();
}

/** Open the detail drawer for the named candidate by clicking its board card. */
export async function openCandidate(page: Page, name: string): Promise<void> {
  await page.locator('[data-testid="candidate-card"]', { hasText: name }).first().click();
  const drawer = page.locator('aside[role="dialog"]:not([inert])');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name })).toBeVisible();
}
