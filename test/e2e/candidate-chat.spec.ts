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
    const chat = page.locator('aside[role="dialog"]:not([inert]) [data-testid="chat"]');
    // Match the static section header exactly — a bare getByText('Discussion')
    // also matches the "Loading discussion…" placeholder (case-insensitive
    // substring), a strict-mode violation. `exact` pins it to the header, which
    // renders immediately. Then wait for that placeholder to clear so the
    // optimistic post below isn't clobbered when the initial thread load
    // resolves.
    await expect(chat.getByText('Discussion', { exact: true })).toBeVisible();
    await expect(
      chat.locator('[data-testid="chat-empty"]', { hasText: 'Loading' })
    ).toHaveCount(0);

    const message = `Looks strong, let's schedule onsite ${Date.now()}`;
    await chat.locator('textarea').fill(message);
    await chat.getByRole('button', { name: 'Send' }).click();

    // The message shows up as a chat bubble in the transcript.
    await expect(chat.locator('[data-testid="chat-messages"]')).toContainText(message);
  });

  test('@-mention autocomplete tags a teammate', async ({ page }) => {
    await openCandidate(page, CANDIDATE);
    const chat = page.locator('aside[role="dialog"]:not([inert]) [data-testid="chat"]');
    const composer = chat.locator('textarea');
    // Let the thread finish loading before composing/posting.
    await expect(
      chat.locator('[data-testid="chat-empty"]', { hasText: 'Loading' })
    ).toHaveCount(0);

    // Typing "@" opens the mention menu over the board's users.
    await composer.fill('cc ');
    await composer.press('End');
    await composer.pressSequentially('@');
    const menu = chat.locator('[data-testid="mention-menu"]');
    await expect(menu).toBeVisible();

    // Pick the first suggestion; its `@Name` token is inserted into the draft.
    const first = menu.locator('[data-testid="mention-item"]').first();
    const mentionName = (
      await first.locator('[data-testid="mention-name"]').textContent()
    )?.trim();
    await first.click();
    await expect(composer).toHaveValue(new RegExp(`@${mentionName}`));

    // Send and confirm the mention renders highlighted in the posted message.
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.locator('[data-testid="chat-messages"] [data-testid="chat-mention"]')).toContainText(
      `@${mentionName}`
    );
  });

  test('messages persist across a reload', async ({ page }) => {
    await openCandidate(page, CANDIDATE);
    const chat = page.locator('aside[role="dialog"]:not([inert]) [data-testid="chat"]');
    // Let the thread finish loading so the optimistic post survives it.
    await expect(
      chat.locator('[data-testid="chat-empty"]', { hasText: 'Loading' })
    ).toHaveCount(0);

    const message = `Persisted chat ${Date.now()}`;
    await chat.locator('textarea').fill(message);
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.locator('[data-testid="chat-messages"]')).toContainText(message);

    await page.reload();
    await openCandidate(page, CANDIDATE);
    await expect(
      page.locator('aside[role="dialog"]:not([inert]) [data-testid="chat"] [data-testid="chat-messages"]')
    ).toContainText(message);
  });
});
