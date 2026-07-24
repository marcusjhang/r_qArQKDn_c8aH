import { test, expect } from '@playwright/test';
import { login, loginToBoard } from './helpers';

// Happy path: two settings edits.
//   1. Add a candidate source from /settings (SourcesPanel -> addSource server
//      action). The new source appears in the sources list.
//   2. Add a pipeline stage on the board (AddStageForm -> store.addStage), then
//      rename an existing stage inline (StageColumn contentEditable ->
//      store.renameStage). These are the board-side "settings"-style edits that
//      reshape a job's pipeline.
test.describe('settings edits', () => {
  test('add a candidate source from /settings', async ({ page }) => {
    await login(page);
    await page.goto('/settings');

    const panel = page.locator('section', {
      hasText: 'Candidate sources'
    });
    await expect(panel).toBeVisible();

    const sourceName = `E2E Source ${Date.now()}`;
    await panel.getByPlaceholder('e.g. AngelList').fill(sourceName);
    await panel.getByRole('button', { name: 'Add source' }).click();

    // The new source shows up as a row in the list.
    await expect(panel.locator('[data-testid="editable-list"]')).toContainText(sourceName);

    // And it survives a reload (persisted via the server action).
    await page.reload();
    await expect(
      page
        .locator('section', { hasText: 'Candidate sources' })
        .locator('[data-testid="editable-list"]')
    ).toContainText(sourceName);
  });

  test('add and rename a pipeline stage on the board', async ({ page }) => {
    await loginToBoard(page);

    const stageName = `E2E Stage ${Date.now()}`;

    // Add a new stage via the inline "Add stage" affordance at the end of the
    // board (AddStageForm).
    await page.getByRole('button', { name: /Add stage/ }).click();
    await page.getByPlaceholder('Stage name').fill(stageName);
    // The form commits on Enter or the "Add" button.
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    const newColumn = page.locator(`[data-stage="${stageName}"]`);
    await expect(newColumn).toBeVisible();

    // Rename it inline: the column title is a contentEditable that commits on
    // blur (StageColumn -> useInlineEdit -> store.renameStage).
    const renamed = `${stageName} (renamed)`;
    const title = newColumn.locator('[title="Click to rename this stage"]');
    await title.click();
    await title.selectText();
    await page.keyboard.type(renamed);
    await title.blur();

    await expect(
      page.locator(`[data-stage="${renamed}"]`)
    ).toBeVisible();
  });
});
