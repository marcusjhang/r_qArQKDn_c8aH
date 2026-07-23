import 'server-only';

// The chat read/write logic, expressed against an injectable `ChatStore` seam
// (see ./chat-store) rather than the `db` singleton — so it is unit-testable in
// a plain Node environment with an in-memory fake, and importing it never
// constructs the postgres client. The thin `'use server'` adapters in
// ./chat-actions call these with the Drizzle-backed store (the default); the
// server component's notification read calls `getNotifications` likewise.
//
// The current-user identity is passed in as an `email` (resolved from the auth
// session by the caller) — this module never imports `@/lib/auth`, keeping the
// logic free of the request-scoped session so tests can drive it directly.

import { z } from 'zod';
import { displayName, initials } from './helpers';
import { zId } from './schemas';
import {
  drizzleChatStore,
  type ChatStore,
  type MessageRow
} from './chat-store';
import type { ChatMessage, Notification } from './types';

const zBody = z.string().trim().min(1).max(4000);
const zMentionIds = z.array(z.number().int().positive()).max(50);

/** Shape a relational message row into the client-facing ChatMessage. */
function toChatMessage(m: MessageRow): ChatMessage {
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
async function currentUserId(
  store: ChatStore,
  email: string | null | undefined
): Promise<number | null> {
  if (!email) return null;
  return store.userIdByEmail(email);
}

/** The full discussion thread for one candidate, oldest first. */
export async function loadThreadWith(
  store: ChatStore,
  candidateIdRaw: number
): Promise<ChatMessage[]> {
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

/** Mark one of the caller's mention notifications as read. */
export async function markNotificationReadWith(
  store: ChatStore,
  email: string | null | undefined,
  mentionIdRaw: number
): Promise<void> {
  const userId = await currentUserId(store, email);
  if (userId == null) return;
  const mentionId = zId.parse(mentionIdRaw);
  // The store scopes the update to (mentionId, userId): a caller can only clear
  // a mention that targets their own account, never someone else's.
  await store.markMentionRead(mentionId, userId);
}

/** Mark every unread mention for the caller as read. */
export async function markAllNotificationsReadWith(
  store: ChatStore,
  email: string | null | undefined
): Promise<void> {
  const userId = await currentUserId(store, email);
  if (userId == null) return;
  await store.markAllMentionsRead(userId);
}

/** Clear (dismiss) one of the caller's mention notifications from the inbox. */
export async function dismissNotificationWith(
  store: ChatStore,
  email: string | null | undefined,
  mentionIdRaw: number
): Promise<void> {
  const userId = await currentUserId(store, email);
  if (userId == null) return;
  const mentionId = zId.parse(mentionIdRaw);
  // The store scopes the update to (mentionId, userId): a caller can only clear
  // a mention that targets their own account, never someone else's.
  await store.dismissMention(mentionId, userId);
}

/** Clear (dismiss) every one of the caller's mention notifications. */
export async function dismissAllNotificationsWith(
  store: ChatStore,
  email: string | null | undefined
): Promise<void> {
  const userId = await currentUserId(store, email);
  if (userId == null) return;
  await store.dismissAllMentions(userId);
}

/**
 * The mentions targeting one user, newest first — the notification inbox.
 * Scoped to `userId` by the store's query.
 */
export async function getNotificationsWith(
  store: ChatStore,
  userId: number,
  limit = 50
): Promise<Notification[]> {
  return store.notificationsFor(userId, limit);
}

// Re-export the production store as the default so callers that don't inject
// one still get the Drizzle-backed implementation.
export { drizzleChatStore };
