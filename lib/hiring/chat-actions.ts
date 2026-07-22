'use server';

// Write + client-triggered read path for the per-applicant chat and the
// mention notification inbox. Every entry point resolves the caller's account
// from the auth session (the whole app is gated by the auth middleware, so a
// caller here is always an authenticated user) — the client never gets to pick
// who "I" am. Chat data (messages/mentions) lives outside the board's
// tag-scoped Data Cache, so these actions mutate and return without a
// cache-wide revalidatePath — the board cache stays warm and the client
// refreshes the dynamic page itself (optimistic thread update; router.refresh
// in NotificationBell).

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db, users, messages, mentions } from '@/lib/db';
import { displayName, initials } from './helpers';
import { zId } from './schemas';
import type { ChatMessage } from './types';

const zBody = z.string().trim().min(1).max(4000);
const zMentionIds = z.array(z.number().int().positive()).max(50);

/**
 * Resolve the signed-in account's numeric id, or null when not signed in.
 * Prefers the id carried on the session (set in the auth JWT callback) and only
 * falls back to an email lookup for sessions minted before that id existed.
 */
async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (Number.isInteger(id) && id > 0) return id;
  const email = session?.user?.email;
  if (!email) return null;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return u?.id ?? null;
}

/** Shape a relational message row into the client-facing ChatMessage. */
function toChatMessage(m: {
  id: number;
  candidateId: number;
  authorId: number;
  body: string;
  createdAt: Date;
  author: { name: string | null; email: string } | null;
  mentions: { user: { id: number; name: string | null; email: string } | null }[];
}): ChatMessage {
  const author = m.author
    ? { id: m.authorId, name: m.author.name, email: m.author.email }
    : undefined;
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

/** The full discussion thread for one candidate, oldest first. */
export async function loadThread(candidateIdRaw: number): Promise<ChatMessage[]> {
  const candidateId = zId.parse(candidateIdRaw);
  const rows = await db.query.messages.findMany({
    where: (msg, { eq }) => eq(msg.candidateId, candidateId),
    orderBy: (msg) => [asc(msg.createdAt), asc(msg.id)],
    with: {
      author: { columns: { name: true, email: true } },
      mentions: {
        with: { user: { columns: { id: true, name: true, email: true } } }
      }
    }
  });
  return rows.map(toChatMessage);
}

/**
 * Post a message to a candidate's thread and fan out mentions to the tagged
 * accounts (deduped; the author never notifies themselves). Returns the
 * persisted message so the client can reconcile its optimistic row.
 */
export async function postMessage(
  candidateIdRaw: number,
  bodyRaw: string,
  mentionedUserIdsRaw: number[]
): Promise<ChatMessage | null> {
  const authorId = await currentUserId();
  if (authorId == null) return null;
  const candidateId = zId.parse(candidateIdRaw);
  const body = zBody.parse(bodyRaw);
  const mentionIds = zMentionIds.parse(mentionedUserIdsRaw);

  const newId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({ candidateId, authorId, body })
      .returning({ id: messages.id });

    // Tag only real accounts, deduped, excluding the author.
    const targets = Array.from(new Set(mentionIds)).filter(
      (id) => id !== authorId
    );
    if (targets.length) {
      const valid = await tx
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, targets));
      const validIds = valid.map((v) => v.id);
      if (validIds.length) {
        await tx
          .insert(mentions)
          .values(validIds.map((userId) => ({ messageId: row.id, userId })));
      }
    }
    return row.id;
  });

  const [created] = await db.query.messages.findMany({
    where: (msg, { eq }) => eq(msg.id, newId),
    limit: 1,
    with: {
      author: { columns: { name: true, email: true } },
      mentions: {
        with: { user: { columns: { id: true, name: true, email: true } } }
      }
    }
  });

  // No cache invalidation needed: chat lives outside the board's tag-scoped
  // Data Cache (BOARD_TAGS), so a message never changes jobs/candidates. The
  // author's thread updates optimistically; recipients pick up the new mention
  // on their next render (page.tsx is dynamic + getNotifications is uncached).
  return created ? toChatMessage(created) : null;
}

/** Mark one of the caller's mention notifications as read. */
export async function markNotificationRead(mentionIdRaw: number) {
  const userId = await currentUserId();
  if (userId == null) return;
  const mentionId = zId.parse(mentionIdRaw);
  await db
    .update(mentions)
    .set({ readAt: new Date() })
    .where(and(eq(mentions.id, mentionId), eq(mentions.userId, userId)));
  // The caller (NotificationBell) calls router.refresh() to re-render the
  // dynamic page and re-read notifications — no board cache to invalidate here.
}

/** Mark every unread mention for the caller as read (clear the inbox). */
export async function markAllNotificationsRead() {
  const userId = await currentUserId();
  if (userId == null) return;
  await db
    .update(mentions)
    .set({ readAt: new Date() })
    .where(and(eq(mentions.userId, userId), isNull(mentions.readAt)));
  // NotificationBell calls router.refresh() to re-read notifications.
}
