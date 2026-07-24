import 'server-only';

// Server-side read for the mention inbox (loaded by the dashboard server component): a thin delegate over ./logic with the Drizzle-backed store.

import { drizzleChatStore, getNotificationsWith } from './logic';
import type { Notification } from '../types';

/** The mentions targeting one user, newest first — the notification inbox. */
export async function getNotifications(
  userId: number,
  limit = 50
): Promise<Notification[]> {
  return getNotificationsWith(drizzleChatStore, userId, limit);
}
