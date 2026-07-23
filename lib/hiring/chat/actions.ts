'use server';

// Write + client-triggered read path for the per-applicant chat and the
// mention notification inbox. These are thin `'use server'` adapters: each
// resolves the caller's email from the auth session (the whole app is gated by
// the auth middleware, so a caller here is always an authenticated user — the
// client never gets to pick who "I" am) and delegates to the injectable chat
// logic (./logic) with the production Drizzle-backed store. The seam keeps
// the logic unit-testable without a database; see chat-logic.test.ts.
//
// Chat data (messages/mentions) lives outside the board's tag-scoped Data
// Cache, so these actions mutate and return without a cache-wide
// revalidatePath — the board cache stays warm and the client reconciles its own
// TanStack Query caches (optimistic thread update in useChatThread; the
// NotificationBell invalidates its notifications query to re-read the inbox).

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
  return session?.user?.email ?? null;
}

/** The full discussion thread for one candidate, oldest first. */
export async function loadThread(
  candidateIdRaw: number
): Promise<ChatMessage[]> {
  return loadThreadWith(drizzleChatStore, candidateIdRaw);
}

/**
 * Post a message to a candidate's thread and fan out mentions to the tagged
 * accounts (deduped; the author never notifies themselves). Returns the
 * persisted message so the client can reconcile its optimistic row.
 */
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
  // The caller (NotificationBell) calls router.refresh() to re-render the
  // dynamic page and re-read notifications — no board cache to invalidate here.
}

/** Mark every unread mention for the caller as read. */
export async function markAllNotificationsRead() {
  await markAllNotificationsReadWith(drizzleChatStore, await callerEmail());
  // NotificationBell calls router.refresh() to re-read notifications.
}

/** Clear (dismiss) one of the caller's mention notifications from the inbox. */
export async function dismissNotification(mentionIdRaw: number) {
  await dismissNotificationWith(
    drizzleChatStore,
    await callerEmail(),
    mentionIdRaw
  );
  // NotificationBell calls router.refresh() to re-read notifications.
}

/** Clear (dismiss) every one of the caller's mention notifications. */
export async function dismissAllNotifications() {
  await dismissAllNotificationsWith(drizzleChatStore, await callerEmail());
  // NotificationBell calls router.refresh() to re-read notifications.
}
