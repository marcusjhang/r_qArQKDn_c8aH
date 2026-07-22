import { test, expect } from '@playwright/test';

// Smoke coverage for the auth gate. The whole app is behind the `authorized`
// middleware (see lib/auth.ts / CLAUDE.md) — every route except /login
// redirects an unauthenticated visitor to the login page.
test.describe('auth gate', () => {
  test('redirects an unauthenticated visitor from the board to /login', async ({
    page
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('serves the login page directly', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/login/);
  });
});
