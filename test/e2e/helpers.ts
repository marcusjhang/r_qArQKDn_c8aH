import { expect, type Page } from '@playwright/test';

// Shared e2e helpers. The whole app is behind the auth gate (see lib/auth.ts /
// middleware.ts), so every happy-path spec has to sign in first. Credentials
// match the seeded login accounts in db/seed.ts (all seeded users share
// SEED_PASSWORD, default 'password'); override via E2E_EMAIL / E2E_PASSWORD to
// point the suite at a differently-seeded environment.
const E2E_EMAIL = process.env.E2E_EMAIL ?? 'marcusajh0802@gmail.com';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'password';

/**
 * Sign in through the real login form (mirrors app/login/page.tsx +
 * useLoginForm) and wait for the board to render. The login form has no test
 * ids, so we target the placeholders it renders and the "Sign In" submit
 * button. On success useLoginForm pushes to '/', so we assert we've left
 * /login.
 */
export async function login(
  page: Page,
  email: string = E2E_EMAIL,
  password: string = E2E_PASSWORD
): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // useLoginForm redirects to '/' on success; wait until we're off /login.
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Sign in and land on the board (the dashboard home at '/'). Returns once the
 * board's toolbar (job title + "Add candidate") is visible.
 */
export async function loginToBoard(page: Page): Promise<void> {
  await login(page);
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
