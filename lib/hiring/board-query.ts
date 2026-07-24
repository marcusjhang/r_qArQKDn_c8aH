'use server';

// Client-callable `'use server'` reads (the queryFns behind the board and notification caches): thin adapters over the `server-only` facades so a `useQuery` can re-read after an invalidate.

import { auth } from '@/lib/auth';
import { hiringService } from './service';
import { drizzleChatStore } from './chat/store';
import { getNotifications } from './chat/queries';
import type { HiringState, Notification } from './types';

/** Re-read the whole board (queryFn behind the board cache). This is a directly POST-able action, so it gates the session itself — the page middleware doesn't gate action POSTs. */
export async function fetchBoard(): Promise<HiringState> {
  const session = await auth();
  // Also reject a session confined to the forced password change (see resolveUserId).
  if (!session?.user || session.user.mustChangePassword === true) {
    throw new Error('Unauthorized');
  }
  return hiringService.getBoard();
}

/** Re-read the caller's mention inbox (queryFn behind the notifications cache); empty when the caller can't be resolved to an account. */
export async function fetchNotifications(): Promise<Notification[]> {
  const session = await auth();
  if (session?.user?.mustChangePassword === true) return [];
  const email = session?.user?.email;
  if (!email) return [];
  const userId = await drizzleChatStore.userIdByEmail(email);
  return userId == null ? [] : getNotifications(userId);
}
