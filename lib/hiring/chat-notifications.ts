import 'server-only';

// The mention notification inbox read/writes, expressed against the injectable
// `ChatStore` seam (see ./chat-store) rather than the `db` singleton — so they
// are unit-testable with an in-memory fake and importing them never constructs
// the postgres client. Every mutation resolves the caller's numeric id and the
// store scopes the write to it, so a caller can only ever clear a mention that
// targets their own account. The `'use server'` adapters in ./chat-actions and
// the server read in ./chat-queries call these with the Drizzle-backed store.

import { zId } from './schemas';
import type { ChatStore } from './chat-store';
import type { Notification } from './types';
import { currentUserId } from './chat-shaping';

/** Mark one of the caller's mention notifications as read. */
export async function markNotificationReadWith(
  store: ChatStore,
  email: string | null | undefined,
  mentionIdRaw: number
): Promise<void> {
  const userId = await currentUserId(store, email);
  if (userId == null) return;
  const mentionId = zId.parse(mentionIdRaw);
  // The store scopes the update to (mentionId, userId): a caller can only clear
  // a mention that targets their own account, never someone else's.
  await store.markMentionRead(mentionId, userId);
}

/** Mark every unread mention for the caller as read. */
export async function markAllNotificationsReadWith(
  store: ChatStore,
  email: string | null | undefined
): Promise<void> {
  const userId = await currentUserId(store, email);
  if (userId == null) return;
  await store.markAllMentionsRead(userId);
}

/** Clear (dismiss) one of the caller's mention notifications from the inbox. */
export async function dismissNotificationWith(
  store: ChatStore,
  email: string | null | undefined,
  mentionIdRaw: number
): Promise<void> {
  const userId = await currentUserId(store, email);
  if (userId == null) return;
  const mentionId = zId.parse(mentionIdRaw);
  // The store scopes the update to (mentionId, userId): a caller can only clear
  // a mention that targets their own account, never someone else's.
  await store.dismissMention(mentionId, userId);
}

/** Clear (dismiss) every one of the caller's mention notifications. */
export async function dismissAllNotificationsWith(
  store: ChatStore,
  email: string | null | undefined
): Promise<void> {
  const userId = await currentUserId(store, email);
  if (userId == null) return;
  await store.dismissAllMentions(userId);
}

/**
 * The mentions targeting one user, newest first — the notification inbox.
 * Scoped to `userId` by the store's query.
 */
export async function getNotificationsWith(
  store: ChatStore,
  userId: number,
  limit = 50
): Promise<Notification[]> {
  return store.notificationsFor(userId, limit);
}
