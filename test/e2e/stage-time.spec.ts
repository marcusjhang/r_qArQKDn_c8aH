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
    await expect(page.locator('[data-testid="time-tag"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="time-tag"][data-overdue="true"]').first()).toBeVisible();

    // A backdated candidate is flagged overdue with a day-count label. Uses Sofia
    // Kim (9d, Offer) rather than Marcus Webb: candidate-move.spec advances
    // Marcus Webb in a parallel worker, which resets his stage clock, so reading
    // him here would race that file's writes. Sofia Kim is read-only across the
    // suite.
    const overdueCard = page.locator('[data-testid="candidate-card"]', { hasText: 'Sofia Kim' });
    await expect(overdueCard.locator('[data-testid="time-tag"][data-overdue="true"]')).toHaveText(/^\d+d$/);

    // A fresh candidate (Ava Chen, 3d in Screen, under the 5-day threshold)
    // shows a plain, non-overdue tag.
    const freshTag = page
      .locator('[data-testid="candidate-card"]', { hasText: 'Ava Chen' })
      .locator('[data-testid="time-tag"]');
    await expect(freshTag).toBeVisible();
    await expect(freshTag).toHaveText(/^\d+d$/);
    await expect(freshTag).not.toHaveAttribute('data-overdue', 'true');
  });

  test('detail drawer footer shows the time in stage, red when overdue', async ({
    page
  }) => {
    await loginToBoard(page);
    // Sofia Kim (9d, overdue), not Marcus Webb — see the board-tag test above.
    await openCandidate(page, 'Sofia Kim');

    const age = page.locator('aside[role="dialog"]:not([inert]) [data-testid="stage-age"]');
    await expect(age).toBeVisible();
    await expect(age).toHaveAttribute('data-overdue', 'true');
    // Just the day count — no "past the N-day limit" verbiage.
    await expect(age).toContainText(/In this stage \d+d/);
    await expect(age).not.toContainText('limit');
  });

  test('the universal stalled-applicant warning is configurable in Settings', async ({
    page
  }) => {
    await login(page);
    await page.goto('/settings');

    const panel = page.locator('section', {
      hasText: 'Stalled applicant warning'
    });
    await expect(panel).toBeVisible();

    const input = panel.getByLabel('Warn after (days)');
    await expect(input).toBeVisible();
    // Read the current value rather than hard-asserting the seeded '5': this
    // mutates a single GLOBAL threshold that every overdue assertion in the suite
    // depends on, and the e2e DB isn't re-seeded between retries — asserting the
    // seeded value as a precondition turns any prior-run drift into a permanent
    // failure. Pick a distinct value to change to.
    const current = await input.inputValue();
    const changed = current === '9' ? '7' : '9';
    const SEEDED_DEFAULT = '5';

    const savePanel = () =>
      page.locator('section', { hasText: 'Stalled applicant warning' });
    try {
      await input.fill(changed);
      await panel.getByRole('button', { name: 'Save' }).click();
      await expect(panel.locator('[data-testid="settings-saved"]')).toBeVisible();

      await page.reload();
      await expect(
        savePanel().getByLabel('Warn after (days)')
      ).toHaveValue(changed);
    } finally {
      // ALWAYS restore the seeded default so the global threshold stays stable
      // for parallel specs and retries, even if an assertion above threw.
      await savePanel().getByLabel('Warn after (days)').fill(SEEDED_DEFAULT);
      await savePanel().getByRole('button', { name: 'Save' }).click();
      await expect(
        savePanel().locator('[data-testid="settings-saved"]')
      ).toBeVisible();
    }
  });

  test('notification bell surfaces the owner’s stalled candidates', async ({
    page
  }) => {
    // benchan owns overdue candidates (Marcus Webb, Sofia Kim). We assert on
    // Sofia Kim: Marcus Webb is advanced by candidate-move.spec in a parallel
    // worker (resetting his clock), so he may not be stalled by the time this
    // runs. Sofia Kim is read-only across the suite.
    await login(page, 'benchan@lightsprint.ai', 'password');
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: /Add candidate/ })
    ).toBeVisible();

    // Open the notification bell.
    await page.locator('[aria-label*="Notifications"]').click();
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();

    // A stalled-candidate alert names an overdue candidate benchan owns and
    // states how long they've been in stage — no "limit" language.
    const alert = menu.locator('[data-testid="notif-item"][data-kind="alert"]', { hasText: 'Sofia Kim' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Stalled candidate');
    await expect(alert).toContainText(/has been in .+ for \d+ days?/);
    await expect(alert).not.toContainText('limit');
  });
});
