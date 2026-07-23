import 'server-only';

// Server-side read for the mention notification inbox. Loaded by the dashboard
// server component (page.tsx) and handed to the client; the client triggers
// further reads/writes through ./actions. The pool of accounts that can be
// @-mentioned is the board's canonical user list (HiringState.users), so the
// chat does not query users separately.
//
// This is a thin delegate over the injectable chat logic (./logic) with
// the production Drizzle-backed store — the seam keeps the read (and its
// per-user scoping) unit-testable without a database.

import { drizzleChatStore, getNotificationsWith } from './logic';
import type { Notification } from '../types';

/**
 * The mentions targeting one user, newest first — the notification inbox.
 * Joins through to the message and its candidate so each row can deep-link to
 * the applicant's chat. `read` folds `readAt` into a boolean for the UI.
 */
export async function getNotifications(
  userId: number,
  limit = 50
): Promise<Notification[]> {
  return getNotificationsWith(drizzleChatStore, userId, limit);
}
