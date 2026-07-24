import { expect, type Page } from '@playwright/test';

// Shared e2e helpers. The whole app is behind the auth gate (see lib/auth.ts /
// middleware.ts). Rather than sign in through the login form in every spec —
// which would hammer the per-IP login rate limiter (lib/rate-limit.ts: 10
// attempts / 5 min) and flake a parallel run — authentication happens ONCE in
// the `setup` project (test/e2e/global.setup.ts), which signs in, clears the
// seeded account's forced first-login password change, and saves the cookies.
// The authenticated `chromium` project loads them via `storageState`, so specs
// start already signed in and these helpers just confirm the session.

/**
 * Confirm/establish an authenticated session.
 *
 * With no credentials, rely on the shared pre-authenticated session (loaded from
 * storageState): visiting a gated route must not bounce us to /login.
 *
 * With an `email`/`password`, sign in as that specific seeded user instead — for
 * specs that need a particular account (e.g. the owner of overdue candidates).
 * The shared session is dropped first, then we sign in through the form and
 * clear the seeded account's forced first-login password change the same way
 * `global.setup.ts` does, so we land on the board rather than /change-password.
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

  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  if (new URL(page.url()).pathname === '/change-password') {
    await page.getByPlaceholder('New password', { exact: true }).fill(password);
    await page.getByPlaceholder('Confirm new password').fill(password);
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

/**
 * Open the detail drawer for the named candidate by clicking its board card.
 * Cards carry data-testid="candidate-card" and an aria-label "Open <name>";
 * the drawer header renders the same name in an <h2> (see DetailHeader).
 */
export async function openCandidate(page: Page, name: string): Promise<void> {
  await page.locator('[data-testid="candidate-card"]', { hasText: name }).first().click();
  const drawer = page.locator('aside[role="dialog"]:not([inert])');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name })).toBeVisible();
}
