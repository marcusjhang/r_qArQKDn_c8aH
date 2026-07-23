import { test, expect } from '@playwright/test';
import { login, loginToBoard, openCandidate } from './helpers';

// Time-in-stage feature (PR #38). Exercises the four user-facing surfaces
// end-to-end against the seeded demo data, which backdates three Founding
// Engineer candidates past their stage limits (see lib/hiring/seed.ts):
//   Marcus Webb  — Applied, 20d  (limit 14)
//   Priya Nair   — Interview, 12d (limit 7)
//   Sofia Kim    — Offer, 9d      (limit 7)
// Those overdue rows are owned by benchan / henghonglee, so the notification
// bell test signs in as benchan to see the "stalled candidate" alerts.
test.describe('time-in-stage', () => {
  test('board cards show time-in-stage tags, red for overdue', async ({
    page
  }) => {
    await loginToBoard(page);

    // Every active card carries a time-in-stage tag; at least one is overdue.
    await expect(page.locator('.card .time-tag').first()).toBeVisible();
    await expect(page.locator('.card .time-tag.overdue').first()).toBeVisible();

    // The backdated Applied candidate is flagged overdue with a day-count label.
    const overdueCard = page.locator('.card', { hasText: 'Marcus Webb' });
    await expect(overdueCard.locator('.time-tag.overdue')).toHaveText(/^\d+d$/);

    // A fresh candidate (Ava Chen, 3d in Screen, limit 10) shows a plain,
    // non-overdue tag.
    const freshTag = page
      .locator('.card', { hasText: 'Ava Chen' })
      .locator('.time-tag');
    await expect(freshTag).toBeVisible();
    await expect(freshTag).toHaveText(/^\d+d$/);
    await expect(freshTag).not.toHaveClass(/overdue/);
  });

  test('detail drawer footer spells out the overdue overrun', async ({
    page
  }) => {
    await loginToBoard(page);
    await openCandidate(page, 'Marcus Webb');

    const age = page.locator('aside.drawer.open .stage-age');
    await expect(age).toBeVisible();
    await expect(age).toHaveClass(/overdue/);
    await expect(age).toContainText('past the 14-day limit');
  });

  test('stage time-limits can be managed in Settings', async ({ page }) => {
    await login(page);
    await page.goto('/settings');

    const panel = page.locator('.settings-panel', {
      hasText: 'Stage time limits'
    });
    await expect(panel).toBeVisible();

    // Seeded defaults are listed.
    await expect(panel.locator('.email-list')).toContainText('Applied');
    await expect(panel.locator('.email-list')).toContainText(
      'warn after 14 days'
    );

    // Add a limit for a brand-new stage name (unique so it can't clash).
    const stage = `E2E Stage ${Date.now()}`;
    await panel.getByPlaceholder('e.g. Interview').fill(stage);
    await panel.getByPlaceholder('7').fill('5');
    await panel.getByRole('button', { name: 'Add limit' }).click();

    // It appears in the list and survives a reload (persisted server-side).
    await expect(panel.locator('.email-list')).toContainText(stage);
    await expect(panel.locator('.email-list')).toContainText(
      'warn after 5 days'
    );

    await page.reload();
    await expect(
      page
        .locator('.settings-panel', { hasText: 'Stage time limits' })
        .locator('.email-list')
    ).toContainText(stage);
  });

  test('notification bell surfaces the owner’s stalled candidates', async ({
    page
  }) => {
    // benchan owns two overdue candidates (Marcus Webb, Sofia Kim).
    await login(page, 'benchan@lightsprint.ai', 'password');
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: /Add candidate/ })
    ).toBeVisible();

    // Open the notification bell.
    await page.locator('.notif-btn').click();
    const menu = page.locator('.notif-menu');
    await expect(menu).toBeVisible();

    // A stalled-candidate alert names an overdue candidate benchan owns.
    const alert = menu.locator('.notif-item.alert', { hasText: 'Marcus Webb' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Stalled candidate');
    await expect(alert).toContainText('past the 14-day limit');
  });
});
