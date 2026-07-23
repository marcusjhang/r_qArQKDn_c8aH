import 'server-only';

// The per-candidate chat thread read/write, expressed against the injectable
// `ChatStore` seam (see ./chat-store) rather than the `db` singleton — so it is
// unit-testable in a plain Node environment with an in-memory fake, and
// importing it never constructs the postgres client. The thin `'use server'`
// adapters in ./chat-actions call these with the Drizzle-backed store.

import { zId } from './schemas';
import type { ChatStore } from './chat-store';
import type { ChatMessage } from './types';
import { currentUserId, toChatMessage, zBody, zMentionIds } from './chat-shaping';

/**
 * The full discussion thread for one candidate, oldest first. Returns an empty
 * thread when the caller can't be resolved to a signed-in account — the thread
 * is private team data, and this is a directly POST-able `'use server'` read
 * (its `queryFn` id ships in the client bundle), so it must gate on the session
 * exactly like the write path does, rather than trusting the page middleware.
 */
export async function loadThreadWith(
  store: ChatStore,
  email: string | null | undefined,
  candidateIdRaw: number
): Promise<ChatMessage[]> {
  const userId = await currentUserId(store, email);
  if (userId == null) return [];
  const candidateId = zId.parse(candidateIdRaw);
  const rows = await store.threadFor(candidateId);
  return rows.map(toChatMessage);
}

/**
 * Post a message to a candidate's thread and fan out mentions to the tagged
 * accounts (deduped; the author never notifies themselves). Returns the
 * persisted message so the client can reconcile its optimistic row, or null
 * when the caller is not signed in.
 */
export async function postMessageWith(
  store: ChatStore,
  email: string | null | undefined,
  candidateIdRaw: number,
  bodyRaw: string,
  mentionedUserIdsRaw: number[]
): Promise<ChatMessage | null> {
  const authorId = await currentUserId(store, email);
  if (authorId == null) return null;
  const candidateId = zId.parse(candidateIdRaw);
  const body = zBody.parse(bodyRaw);
  const mentionIds = zMentionIds.parse(mentionedUserIdsRaw);

  // Tag only real accounts, deduped, excluding the author.
  const targets = Array.from(new Set(mentionIds)).filter(
    (id) => id !== authorId
  );
  const mentionUserIds = targets.length
    ? await store.existingUserIds(targets)
    : [];

  const newId = await store.insertMessage({
    candidateId,
    authorId,
    body,
    mentionUserIds
  });

  const created = await store.messageById(newId);
  return created ? toChatMessage(created) : null;
}
