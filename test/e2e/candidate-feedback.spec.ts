import { test, expect } from '@playwright/test';
import { loginToBoard, openCandidate } from './helpers';

// Happy path: leave interview feedback on a candidate. The add-feedback form
// (AddFeedbackForm) lives in the detail drawer: score one or more of the job's
// traits on the 1-4 picker, write a note, and submit. Feedback is always
// authored by the signed-in user (derived server-side), so there is no
// interviewer picker; the signed-in user has one entry per candidate, edited in
// place (upsert). Submitting adds/updates the entry in the feedback list
// (FeedbackList) optimistically and persists it (store.saveFeedback). Entries
// are collapsed by default — expand one to read its note.
//
// Uses seeded candidate "Tom Alvarez" (Founding Engineer) who has NO feedback
// yet. The Founding Engineer job tracks traits, so the trait score pickers are
// shown. See lib/hiring/seed.ts.
const CANDIDATE = 'Tom Alvarez';

test.describe('add feedback to a candidate', () => {
  test.beforeEach(async ({ page }) => {
    await loginToBoard(page);
  });

  test('scoring a trait + note adds it to the feedback list', async ({
    page
  }) => {
    await openCandidate(page, CANDIDATE);
    const drawer = page.locator('aside.drawer.open');
    const form = drawer.locator('.add-fb');

    // Score the first tracked trait: click "4" and confirm it becomes active.
    const firstTrait = form.locator('.trait-score-input').first();
    const four = firstTrait.getByRole('button', { name: '4', exact: true });
    await four.click();
    await expect(four).toHaveAttribute('aria-pressed', 'true');

    // Write a note and submit (button label is Add/Update feedback).
    const note = `Great systems thinking - E2E ${Date.now()}`;
    await form.locator('textarea').fill(note);
    await form.getByRole('button', { name: /feedback/i }).click();

    // A collapsed entry appears in the list; expand it to read the note.
    const entry = drawer.locator('.fb-entry').first();
    await expect(entry).toBeVisible();
    await entry.locator('.fb-head').click();
    await expect(entry.locator('.fb-detail')).toContainText(note);
  });

  test('feedback persists across a reload', async ({ page }) => {
    await openCandidate(page, CANDIDATE);
    const drawer = page.locator('aside.drawer.open');
    const form = drawer.locator('.add-fb');

    const note = `Persisted note ${Date.now()}`;
    await form
      .locator('.trait-score-input')
      .first()
      .getByRole('button', { name: '3', exact: true })
      .click();
    await form.locator('textarea').fill(note);
    await form.getByRole('button', { name: /feedback/i }).click();

    const entry = drawer.locator('.fb-entry').first();
    await entry.locator('.fb-head').click();
    await expect(entry.locator('.fb-detail')).toContainText(note);

    await page.reload();
    await openCandidate(page, CANDIDATE);
    const reopened = page.locator('aside.drawer.open .fb-entry').first();
    await reopened.locator('.fb-head').click();
    await expect(reopened.locator('.fb-detail')).toContainText(note);
  });
});
