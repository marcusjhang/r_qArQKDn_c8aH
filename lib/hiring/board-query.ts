'use server';

// Client-callable reads for the board and the mention inbox — the query
// functions behind the TanStack Query caches on the client.
//
// These are thin `'use server'` adapters over the existing read facades
// (`service.ts` for the board, `chat-queries.ts` for notifications). They exist
// because a `useQuery` needs a function it can call from the client to re-read
// after an `invalidateQueries`; the underlying facades are `server-only` and
// can't be imported into a client bundle directly. The board reads are uncached
// (see service/reader), so this fetch always returns the current rows straight
// from Postgres — TanStack Query is the only cache in front of it.
//
// The caller's identity for notifications is resolved from the auth session
// server-side (never trusted from the client), mirroring chat-actions.

import { auth } from '@/lib/auth';
import { hiringService } from './service';
import { drizzleChatStore } from './chat-store';
import { getNotifications } from './chat-queries';
import type { HiringState, Notification } from './types';

/** Re-read the whole board. The queryFn behind the board cache. */
export async function fetchBoard(): Promise<HiringState> {
  return hiringService.getBoard();
}

/**
 * Re-read the signed-in caller's mention inbox. The queryFn behind the
 * notifications cache. Returns an empty list when the caller can't be resolved
 * to an account (not signed in / unknown email).
 */
export async function fetchNotifications(): Promise<Notification[]> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return [];
  const userId = await drizzleChatStore.userIdByEmail(email);
  return userId == null ? [] : getNotifications(userId);
}
