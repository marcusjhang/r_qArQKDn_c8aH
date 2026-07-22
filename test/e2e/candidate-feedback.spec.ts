import { test, expect } from '@playwright/test';
import { loginToBoard, openCandidate } from './helpers';

// Happy path: leave interview feedback on a candidate. The add-feedback form
// (AddFeedbackForm) lives in the detail drawer: pick an interviewer, click a
// rating in the 4-point picker (Strong No / No / Yes / Strong Yes), write a
// note, and submit. Submitting appends the entry to the feedback list
// (FeedbackList) optimistically and persists it (store.addFeedback).
//
// Uses seeded candidate "Tom Alvarez" (Founding Engineer) who has NO feedback
// yet, so every seeded interviewer is still available in the picker. See
// lib/hiring/seed.ts.
const CANDIDATE = 'Tom Alvarez';

test.describe('add feedback to a candidate', () => {
  test.beforeEach(async ({ page }) => {
    await loginToBoard(page);
  });

  test('submitting a rating + note adds it to the feedback list', async ({
    page
  }) => {
    await openCandidate(page, CANDIDATE);
    const drawer = page.locator('aside.drawer.open');
    const form = drawer.locator('.add-fb');

    // Choose an interviewer (the first available in the picklist).
    const interviewer = form.locator('select');
    await expect(interviewer).toBeVisible();

    // Pick a rating from the 4-point picker and confirm it becomes active.
    const strongYes = form.getByRole('button', { name: 'Strong Yes' });
    await strongYes.click();
    await expect(strongYes).toHaveAttribute('aria-pressed', 'true');

    // Write a note and submit.
    const note = `Great systems thinking — E2E ${Date.now()}`;
    await form.locator('textarea').fill(note);
    await form.getByRole('button', { name: 'Add feedback' }).click();

    // The new note shows up in the feedback list above the form.
    await expect(drawer.locator('.feedback')).toContainText(note);
  });

  test('feedback persists across a reload', async ({ page }) => {
    await openCandidate(page, CANDIDATE);
    const drawer = page.locator('aside.drawer.open');
    const form = drawer.locator('.add-fb');

    // If everyone has already reviewed (e.g. a re-run against the same seed),
    // the form collapses to an empty-state and there is nothing to add.
    const emptyState = form.locator('.fb-empty');
    if (await emptyState.count()) {
      test.skip(true, 'All interviewers have already reviewed this candidate.');
    }

    const note = `Persisted note ${Date.now()}`;
    await form.getByRole('button', { name: 'Yes', exact: true }).click();
    await form.locator('textarea').fill(note);
    await form.getByRole('button', { name: 'Add feedback' }).click();
    await expect(drawer.locator('.feedback')).toContainText(note);

    await page.reload();
    await openCandidate(page, CANDIDATE);
    await expect(
      page.locator('aside.drawer.open .feedback')
    ).toContainText(note);
  });
});
