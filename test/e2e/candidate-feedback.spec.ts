import { test, expect } from '@playwright/test';
import { loginToBoard, openCandidate } from './helpers';

// Happy path: leave interview feedback in the detail drawer — score the job's
// traits on the 1-4 picker, add a note, submit. Feedback is authored by the
// signed-in user (one upsert entry per candidate) and persisted optimistically.
// Uses seeded "Tom Alvarez" (Founding Engineer, tracks traits, no feedback yet).
const CANDIDATE = 'Tom Alvarez';

test.describe('add feedback to a candidate', () => {
  test.beforeEach(async ({ page }) => {
    await loginToBoard(page);
  });

  test('scoring a trait + note adds it to the feedback list', async ({
    page
  }) => {
    await openCandidate(page, CANDIDATE);
    const drawer = page.locator('aside[role="dialog"]:not([inert])');
    const form = drawer.locator('[data-testid="add-feedback"]');

    // Score the first tracked trait: click "4" and confirm it becomes active.
    const firstTrait = form.locator('[data-testid="trait-score-input"]').first();
    const four = firstTrait.getByRole('button', { name: '4', exact: true });
    await four.click();
    await expect(four).toHaveAttribute('aria-pressed', 'true');

    // Write a note and submit (button label is Add/Update feedback).
    const note = `Great systems thinking - E2E ${Date.now()}`;
    await form.locator('textarea').fill(note);
    await form.getByRole('button', { name: /feedback/i }).click();

    // A collapsed entry appears in the list; expand it to read the note.
    const entry = drawer.locator('[data-testid="feedback-entry"]').first();
    await expect(entry).toBeVisible();
    await entry.locator('[data-testid="feedback-entry-head"]').click();
    await expect(entry.locator('[data-testid="feedback-entry-detail"]')).toContainText(note);
  });

  test('feedback persists across a reload', async ({ page }) => {
    await openCandidate(page, CANDIDATE);
    const drawer = page.locator('aside[role="dialog"]:not([inert])');
    const form = drawer.locator('[data-testid="add-feedback"]');

    const note = `Persisted note ${Date.now()}`;
    await form
      .locator('[data-testid="trait-score-input"]')
      .first()
      .getByRole('button', { name: '3', exact: true })
      .click();
    await form.locator('textarea').fill(note);
    // Optimistic write: wait for the feedback write to commit before reloading
    // (else it's cancelled). Match by the unique note text, since the
    // board/notification refetches are also POSTs (waiting on any POST is flaky).
    const persisted = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        (r.request().postData() ?? '').includes(note) &&
        r.ok()
    );
    await form.getByRole('button', { name: /feedback/i }).click();

    const entry = drawer.locator('[data-testid="feedback-entry"]').first();
    await entry.locator('[data-testid="feedback-entry-head"]').click();
    await expect(entry.locator('[data-testid="feedback-entry-detail"]')).toContainText(note);
    await persisted;

    await page.reload();
    await openCandidate(page, CANDIDATE);
    const reopened = page.locator('aside[role="dialog"]:not([inert]) [data-testid="feedback-entry"]').first();
    await reopened.locator('[data-testid="feedback-entry-head"]').click();
    await expect(reopened.locator('[data-testid="feedback-entry-detail"]')).toContainText(note);
  });
});
