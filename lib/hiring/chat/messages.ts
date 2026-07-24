import 'server-only';

// The per-candidate chat thread read/write, expressed against the injectable `ChatStore` seam so it's unit-testable without a DB.

import { zId } from '../schemas';
import type { ChatStore } from './store';
import type { ChatMessage } from '../types';
import { currentUserId, toChatMessage, zBody, zMentionIds } from './shaping';

/** The full thread for one candidate, oldest first. Returns empty when the caller isn't signed in — this is a directly POST-able `'use server'` read, so it gates on the session itself rather than trusting the page middleware. */
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

/** Post a message and fan out mentions (deduped, never self). Returns the persisted message, or null when the caller isn't signed in. */
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
