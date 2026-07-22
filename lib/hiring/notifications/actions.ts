'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { db, notifications } from '@/lib/db';
import { auth } from '@/lib/auth';
import { founderByEmail } from '../helpers';
import { zId } from '../schemas';
import { getNotifications } from './queries';
import type { SelectNotification } from '@/lib/schema';

/** The founder identity of the signed-in user, or null if not a founder. */
async function currentFounderId(): Promise<string | null> {
  const session = await auth();
  return founderByEmail(session?.user?.email)?.id ?? null;
}

export interface NotificationFeed {
  /** 'own' = filtered to the signed-in founder; 'all' = viewer isn't a founder. */
  scope: 'own' | 'all';
  items: SelectNotification[];
}

/**
 * Sweep warnings + return the feed for the signed-in user. A founder sees only
 * their own notifications; a non-founder (e.g. an admin login) sees the whole
 * team feed as a fallback.
 */
export async function listNotifications(): Promise<NotificationFeed> {
  const founderId = await currentFounderId();
  const items = await getNotifications(founderId ?? undefined);
  return { scope: founderId ? 'own' : 'all', items };
}

export async function markNotificationRead(idRaw: number) {
  const id = zId.parse(idRaw);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, id));
}

export async function markAllNotificationsRead() {
  const founderId = await currentFounderId();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      founderId
        ? and(
            isNull(notifications.readAt),
            eq(notifications.recipientFounderId, founderId)
          )
        : isNull(notifications.readAt)
    );
}
