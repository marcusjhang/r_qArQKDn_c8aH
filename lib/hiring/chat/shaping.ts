import 'server-only';

// Shared shaping / identity primitives for the chat logic. Framework-free: identity is resolved by email through the `ChatStore` seam, so these never import `@/lib/auth`.

import { z } from 'zod';
import { displayName, initials } from '../helpers';
import type { ChatStore, MessageRow } from './store';
import type { ChatMessage } from '../types';

export const zBody = z.string().trim().min(1).max(4000);
export const zMentionIds = z.array(z.number().int().positive()).max(50);

/** Shape a relational message row into the client-facing ChatMessage. */
export function toChatMessage(m: MessageRow): ChatMessage {
  const author = m.author ?? undefined;
  return {
    id: m.id,
    candidateId: m.candidateId,
    authorId: m.authorId,
    authorName: displayName(author),
    authorInitials: initials(author),
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    mentions: m.mentions
      .map((x) => x.user)
      .filter((u): u is NonNullable<typeof u> => u != null)
      .map((u) => ({ userId: u.id, name: displayName(u) }))
  };
}

/** Resolve the user's numeric id from their email (not a JWT-captured id, which goes stale if a reseed renumbers the rows and would trip the author_id FK). */
export async function currentUserId(
  store: ChatStore,
  email: string | null | undefined
): Promise<number | null> {
  if (!email) return null;
  return store.userIdByEmail(email);
}
