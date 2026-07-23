import { test, expect } from '@playwright/test';
import { login, loginToBoard, openCandidate } from './helpers';

// Time-in-stage feature (PR #38). Exercises the four user-facing surfaces
// end-to-end against the seeded demo data. One universal "warn after N days"
// threshold (seeded at 5) applies to every stage; the demo backdates several
// Founding Engineer candidates past it (Marcus Webb 20d, Priya Nair 12d, Sofia
// Kim 9d, Tom Alvarez 5d) while Ava Chen (3d) stays fresh. The overdue rows are
// owned by benchan / henghonglee, so the notification-bell test signs in as
// benchan.
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

    // A fresh candidate (Ava Chen, 3d in Screen, under the 5-day threshold)
    // shows a plain, non-overdue tag.
    const freshTag = page
      .locator('.card', { hasText: 'Ava Chen' })
      .locator('.time-tag');
    await expect(freshTag).toBeVisible();
    await expect(freshTag).toHaveText(/^\d+d$/);
    await expect(freshTag).not.toHaveClass(/overdue/);
  });

  test('detail drawer footer shows the time in stage, red when overdue', async ({
    page
  }) => {
    await loginToBoard(page);
    await openCandidate(page, 'Marcus Webb');

    const age = page.locator('aside.drawer.open .stage-age');
    await expect(age).toBeVisible();
    await expect(age).toHaveClass(/overdue/);
    // Just the day count — no "past the N-day limit" verbiage.
    await expect(age).toContainText(/In this stage \d+d/);
    await expect(age).not.toContainText('limit');
  });

  test('the universal stalled-applicant warning is configurable in Settings', async ({
    page
  }) => {
    await login(page);
    await page.goto('/settings');

    const panel = page.locator('.settings-panel', {
      hasText: 'Stalled applicant warning'
    });
    await expect(panel).toBeVisible();

    const input = panel.getByLabel('Warn after (days)');
    await expect(input).toHaveValue('5'); // seeded default

    // Change it, save, and confirm it persists across a reload.
    await input.fill('9');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel.locator('.settings-saved')).toBeVisible();

    await page.reload();
    const reloaded = page
      .locator('.settings-panel', { hasText: 'Stalled applicant warning' })
      .getByLabel('Warn after (days)');
    await expect(reloaded).toHaveValue('9');

    // Reset to the seeded value so the threshold stays stable for other specs.
    await reloaded.fill('5');
    await page
      .locator('.settings-panel', { hasText: 'Stalled applicant warning' })
      .getByRole('button', { name: 'Save' })
      .click();
    await expect(
      page
        .locator('.settings-panel', { hasText: 'Stalled applicant warning' })
        .locator('.settings-saved')
    ).toBeVisible();
  });

  test('notification bell surfaces the owner’s stalled candidates', async ({
    page
  }) => {
    // benchan owns overdue candidates (Marcus Webb, Sofia Kim).
    await login(page, 'benchan@lightsprint.ai', 'password');
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: /Add candidate/ })
    ).toBeVisible();

    // Open the notification bell.
    await page.locator('.notif-btn').click();
    const menu = page.locator('.notif-menu');
    await expect(menu).toBeVisible();

    // A stalled-candidate alert names an overdue candidate benchan owns and
    // states how long they've been in stage — no "limit" language.
    const alert = menu.locator('.notif-item.alert', { hasText: 'Marcus Webb' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Stalled candidate');
    await expect(alert).toContainText(/has been in .+ for \d+ days?/);
    await expect(alert).not.toContainText('limit');
  });
});
