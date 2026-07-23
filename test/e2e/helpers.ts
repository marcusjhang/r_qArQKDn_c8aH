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
 * Confirm the shared authenticated session (loaded from storageState) is live:
 * visiting a gated route must not bounce us to /login.
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).not.toHaveURL(/\/login/);
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
 * Cards render the candidate name in a `.card-name` span (see CandidateCard);
 * the drawer header renders the same name in an <h2> (see DetailHeader).
 */
export async function openCandidate(page: Page, name: string): Promise<void> {
  await page.locator('.card', { hasText: name }).first().click();
  const drawer = page.locator('aside.drawer.open');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name })).toBeVisible();
}
