import 'server-only';

// The mention inbox read/writes, expressed against the injectable `ChatStore` seam so they're unit-testable without a DB. Every mutation scopes the write to the caller's id, so a caller can only clear mentions targeting their own account.

import { zId } from '../schemas';
import type { ChatStore } from './store';
import type { Notification } from '../types';
import { currentUserId } from './shaping';

/** Mark one of the caller's mention notifications as read. */
export async function markNotificationReadWith(
  store: ChatStore,
  email: string | null | undefined,
  mentionIdRaw: number
): Promise<void> {
  const userId = await currentUserId(store, email);
  if (userId == null) return;
  const mentionId = zId.parse(mentionIdRaw);
  // Scoped to (mentionId, userId): a caller can only clear a mention targeting their own account.
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
  // Scoped to (mentionId, userId): a caller can only clear a mention targeting their own account.
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

/** The mentions targeting one user, newest first — the notification inbox. */
export async function getNotificationsWith(
  store: ChatStore,
  userId: number,
  limit = 50
): Promise<Notification[]> {
  return store.notificationsFor(userId, limit);
}
