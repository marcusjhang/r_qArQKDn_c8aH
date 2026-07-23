import 'server-only';

// Shared shaping / identity primitives for the chat logic (see ./chat-messages
// and ./chat-notifications). All framework-free: the current-user identity is
// resolved through the injectable `ChatStore` seam by email, so these never
// import `@/lib/auth` and stay unit-testable with an in-memory fake.

import { z } from 'zod';
import { displayName, initials } from './helpers';
import type { ChatStore, MessageRow } from './chat-store';
import type { ChatMessage } from './types';

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

/**
 * Resolve the signed-in user's numeric id from their email, or null when not
 * signed in / unknown.
 *
 * Resolves by email (the stable login identity) against the live users table
 * rather than trusting a JWT-captured id: that id goes stale if the users table
 * is ever rebuilt (e.g. a reseed renumbers the rows), which would otherwise
 * insert a dangling author_id and trip the messages_author_id FK.
 */
export async function currentUserId(
  store: ChatStore,
  email: string | null | undefined
): Promise<number | null> {
  if (!email) return null;
  return store.userIdByEmail(email);
}
