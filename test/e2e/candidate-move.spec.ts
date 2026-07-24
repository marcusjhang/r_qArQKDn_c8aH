import { test, expect } from '@playwright/test';
import { loginToBoard, openCandidate } from './helpers';

// Happy path: move a candidate between pipeline stages. The board supports
// drag-and-drop between columns, but the same stage transition is also driven
// from the detail drawer's "Advance stage" / "Move back" controls (see
// DetailFooter -> HiringApp.moveAndClose -> store.advance -> store.moveTo),
// which are far more robust to drive in an e2e than HTML5 DnD. We assert the
// candidate leaves its old column and lands in the next one.
//
// Uses the seeded candidate "Marcus Webb" (job "Founding Engineer"), seeded in
// the "Applied" stage with the default pipeline (Applied -> Screen -> ...), so
// advancing moves them Applied -> Screen. See lib/hiring/seed.ts.
const CANDIDATE = 'Marcus Webb';
// Fallback "next" stage when the candidate is at the seeded start (Applied); the
// test otherwise derives from/to from the live column order to stay retry-safe.
const TO_STAGE = 'Screen';

test.describe('move a candidate between stages', () => {
  test.beforeEach(async ({ page }) => {
    await loginToBoard(page);
  });

  test('advancing a candidate moves them to the next stage', async ({
    page
  }) => {
    await expect(
      page.locator('[data-testid="candidate-card"]', { hasText: CANDIDATE }).first()
    ).toBeVisible();

    // Read the candidate's CURRENT stage rather than asserting the seeded start:
    // the e2e DB is shared and not re-seeded between retries, so a prior attempt
    // that already advanced this candidate must not turn a flake into a permanent
    // failure. "Advance" always moves one column right, so derive from/to from the
    // live column order.
    const { stages, fromStage } = await page.evaluate((name) => {
      const cols = [...document.querySelectorAll('[data-stage]')];
      const order = cols.map((c) => c.getAttribute('data-stage'));
      const col = cols.find((c) =>
        [...c.querySelectorAll('[data-testid="candidate-card"]')].some((card) =>
          card.textContent?.includes(name)
        )
      );
      return { stages: order, fromStage: col?.getAttribute('data-stage') ?? null };
    }, CANDIDATE);
    const toStage = stages[stages.indexOf(fromStage) + 1] ?? TO_STAGE;

    // Open the drawer and advance a stage. Moving closes the drawer and returns
    // to the board so the change is visible (see DetailDrawer.moveAndClose).
    await openCandidate(page, CANDIDATE);
    await page.getByRole('button', { name: /Advance stage/ }).click();

    // The drawer closes and the card now lives in the next column.
    await expect(page.locator('aside[role="dialog"]:not([inert])')).toHaveCount(0);
    await expect(
      page.locator(`[data-stage="${toStage}"] [data-testid="candidate-card"]`, {
        hasText: CANDIDATE
      })
    ).toBeVisible();
    await expect(
      page.locator(`[data-stage="${fromStage}"] [data-testid="candidate-card"]`, {
        hasText: CANDIDATE
      })
    ).toHaveCount(0);
  });

  test('the stage change survives a reload (persisted)', async ({ page }) => {
    await openCandidate(page, CANDIDATE);

    // Read the current stage from the drawer footer, then advance. The move is
    // optimistic and the drawer closes immediately, but the reload below must
    // not race the server write: reloading mid-flight aborts the pending
    // moveStage server action before it commits, and the reopened stage would
    // read the pre-move row. The board does no interval polling, so once the
    // move (and any drawer-mount reads) settle the network goes idle — wait for
    // that before reloading so the write is guaranteed committed.
    const footer = page.locator('[data-testid="stage-now"]');
    const before = (await footer.textContent())?.trim();

    await page.getByRole('button', { name: /Advance stage/ }).click();
    await expect(page.locator('aside[role="dialog"]:not([inert])')).toHaveCount(0);
    await page.waitForLoadState('networkidle');

    // Reopen after a reload: the persisted stage should differ from before.
    await page.reload();
    await openCandidate(page, CANDIDATE);
    const after = (await page.locator('[data-testid="stage-now"]').textContent())?.trim();
    expect(after).not.toEqual(before);
  });
});
