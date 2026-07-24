'use server';

// Thin `'use server'` adapters for the chat + mention inbox: each resolves the caller's email from the session (never the client) and delegates to the injectable ./logic with the Drizzle-backed store. No server cache to invalidate.

import { auth } from '@/lib/auth';
import {
  dismissAllNotificationsWith,
  dismissNotificationWith,
  drizzleChatStore,
  loadThreadWith,
  markAllNotificationsReadWith,
  markNotificationReadWith,
  postMessageWith
} from './logic';
import type { ChatMessage } from '../types';

/** The signed-in caller's email from the session, or null when not signed in. */
async function callerEmail(): Promise<string | null> {
  const session = await auth();
  // A session confined to the forced password change can't act as the caller (mirrors resolveUserId).
  if (session?.user?.mustChangePassword === true) return null;
  return session?.user?.email ?? null;
}

/** The full discussion thread for one candidate, oldest first. */
export async function loadThread(
  candidateIdRaw: number
): Promise<ChatMessage[]> {
  return loadThreadWith(drizzleChatStore, await callerEmail(), candidateIdRaw);
}

/** Post a message and fan out mentions (deduped, never self). Returns the persisted message so the client can reconcile its optimistic row. */
export async function postMessage(
  candidateIdRaw: number,
  bodyRaw: string,
  mentionedUserIdsRaw: number[]
): Promise<ChatMessage | null> {
  return postMessageWith(
    drizzleChatStore,
    await callerEmail(),
    candidateIdRaw,
    bodyRaw,
    mentionedUserIdsRaw
  );
}

/** Mark one of the caller's mention notifications as read. */
export async function markNotificationRead(mentionIdRaw: number) {
  await markNotificationReadWith(
    drizzleChatStore,
    await callerEmail(),
    mentionIdRaw
  );
  // The NotificationBell invalidates its notifications query to re-read the inbox.
}

/** Mark every unread mention for the caller as read. */
export async function markAllNotificationsRead() {
  await markAllNotificationsReadWith(drizzleChatStore, await callerEmail());
  // The NotificationBell invalidates its notifications query to re-read the inbox.
}

/** Clear (dismiss) one of the caller's mention notifications from the inbox. */
export async function dismissNotification(mentionIdRaw: number) {
  await dismissNotificationWith(
    drizzleChatStore,
    await callerEmail(),
    mentionIdRaw
  );
  // The NotificationBell invalidates its notifications query to re-read the inbox.
}

/** Clear (dismiss) every one of the caller's mention notifications. */
export async function dismissAllNotifications() {
  await dismissAllNotificationsWith(drizzleChatStore, await callerEmail());
  // The NotificationBell invalidates its notifications query to re-read the inbox.
}
