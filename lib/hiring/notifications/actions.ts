'use server';

import { eq, isNull } from 'drizzle-orm';
import { db, notifications } from '@/lib/db';
import { zId } from '../schemas';
import { getNotifications } from './queries';
import type { SelectNotification } from '@/lib/schema';

/** Sweep warnings + return the feed (called by the notification bell). */
export async function listNotifications(): Promise<SelectNotification[]> {
  return getNotifications();
}

export async function markNotificationRead(idRaw: number) {
  const id = zId.parse(idRaw);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, id));
}

export async function markAllNotificationsRead() {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(isNull(notifications.readAt));
}
