import { test, expect } from '@playwright/test';
import { loginToBoard, openCandidate } from './helpers';

// Happy path: the per-applicant discussion thread (ChatPanel) inside the detail
// drawer. Messages load when a candidate opens, and sending appends the message
// optimistically (store + chat/actions.postMessage) and persists it against the
// candidate so the thread "follows the applicant". We also exercise the
// @-mention autocomplete, which tags a teammate.
//
// Uses seeded candidate "Ava Chen" (Founding Engineer). See lib/hiring/seed.ts.
const CANDIDATE = 'Ava Chen';

test.describe('candidate discussion chat', () => {
  test.beforeEach(async ({ page }) => {
    await loginToBoard(page);
  });

  test('sending a message appends it to the thread', async ({ page }) => {
    await openCandidate(page, CANDIDATE);
    const chat = page.locator('aside.drawer.open .chat');
    // Match the title exactly — a substring match also hits the
    // "Loading discussion…" placeholder (strict-mode violation). Then wait for
    // that placeholder to clear so the optimistic post below isn't clobbered
    // when the initial thread load resolves.
    await expect(chat.getByText('Discussion', { exact: true })).toBeVisible();
    await expect(
      chat.locator('.chat-empty', { hasText: 'Loading' })
    ).toHaveCount(0);

    const message = `Looks strong, let's schedule onsite ${Date.now()}`;
    await chat.locator('textarea').fill(message);
    await chat.getByRole('button', { name: 'Send' }).click();

    // The message shows up as a chat bubble in the transcript.
    await expect(chat.locator('.chat-msgs')).toContainText(message);
  });

  test('@-mention autocomplete tags a teammate', async ({ page }) => {
    await openCandidate(page, CANDIDATE);
    const chat = page.locator('aside.drawer.open .chat');
    const composer = chat.locator('textarea');
    // Let the thread finish loading before composing/posting.
    await expect(
      chat.locator('.chat-empty', { hasText: 'Loading' })
    ).toHaveCount(0);

    // Typing "@" opens the mention menu over the board's users.
    await composer.fill('cc ');
    await composer.press('End');
    await composer.pressSequentially('@');
    const menu = chat.locator('.mention-menu');
    await expect(menu).toBeVisible();

    // Pick the first suggestion; its `@Name` token is inserted into the draft.
    const first = menu.locator('.mention-item').first();
    const mentionName = (
      await first.locator('.mention-name').textContent()
    )?.trim();
    await first.click();
    await expect(composer).toHaveValue(new RegExp(`@${mentionName}`));

    // Send and confirm the mention renders highlighted in the posted message.
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.locator('.chat-msgs .mention')).toContainText(
      `@${mentionName}`
    );
  });

  test('messages persist across a reload', async ({ page }) => {
    await openCandidate(page, CANDIDATE);
    const chat = page.locator('aside.drawer.open .chat');
    // Let the thread finish loading so the optimistic post survives it.
    await expect(
      chat.locator('.chat-empty', { hasText: 'Loading' })
    ).toHaveCount(0);

    const message = `Persisted chat ${Date.now()}`;
    await chat.locator('textarea').fill(message);
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.locator('.chat-msgs')).toContainText(message);

    await page.reload();
    await openCandidate(page, CANDIDATE);
    await expect(
      page.locator('aside.drawer.open .chat .chat-msgs')
    ).toContainText(message);
  });
});
