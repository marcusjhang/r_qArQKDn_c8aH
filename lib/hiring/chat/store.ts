import 'server-only';

// The data dependency the chat actions/queries read and write through — the
// injectable seam that mirrors `service.ts`'s `BoardReader`. The chat logic is
// expressed against this `ChatStore` interface rather than the `db` singleton,
// so it can be unit-tested with an in-memory fake — no live database and no
// `DATABASE_URL`. Production passes the Drizzle-backed implementation (the
// default `drizzleChatStore`); tests pass a fake.
//
// `db` is imported lazily inside each method (never at module load), so merely
// importing this module — or the ./actions / ./queries adapters that default to
// it — does not construct the postgres client or require `DATABASE_URL`.

import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Notification } from '../types';

/** A relational message row as read back for shaping into a `ChatMessage`. */
export interface MessageRow {
  id: number;
  candidateId: number;
  authorId: number;
  body: string;
  createdAt: Date;
  author: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  mentions: {
    user: {
      id: number;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
  }[];
}

/**
 * The reads and writes the chat entry points depend on. Every method that acts
 * on a caller's notifications takes the resolved `userId` and scopes the write
 * to it — the authorization guard lives in the query itself, not in a check the
 * caller could forget. A fake implementation can assert that scoping directly.
 */
export interface ChatStore {
  /** Resolve the numeric id of the account with `email`, or null if unknown. */
  userIdByEmail(email: string): Promise<number | null>;
  /** Every message on a candidate's thread, oldest first. */
  threadFor(candidateId: number): Promise<MessageRow[]>;
  /** Read back one message (with author + mentions) by id, or null. */
  messageById(id: number): Promise<MessageRow | null>;
  /** Return the subset of `ids` that are real accounts. */
  existingUserIds(ids: number[]): Promise<number[]>;
  /**
   * Insert a message and its (already validated/deduped) mention targets in one
   * transaction; return the new message id.
   */
  insertMessage(input: {
    candidateId: number;
    authorId: number;
    body: string;
    mentionUserIds: number[];
  }): Promise<number>;
  /**
   * Mark one mention read — ONLY when it belongs to `userId`. A mention that
   * targets another account must not be affected. Returns nothing (idempotent).
   */
  markMentionRead(mentionId: number, userId: number): Promise<void>;
  /** Mark every unread mention owned by `userId` as read. */
  markAllMentionsRead(userId: number): Promise<void>;
  /**
   * Dismiss (clear from the inbox) one mention — ONLY when it belongs to
   * `userId`. Same per-user guard as `markMentionRead`; idempotent.
   */
  dismissMention(mentionId: number, userId: number): Promise<void>;
  /** Dismiss every not-yet-dismissed mention owned by `userId`. */
  dismissAllMentions(userId: number): Promise<void>;
  /**
   * The not-dismissed mentions targeting `userId`, newest first — the
   * notification inbox.
   */
  notificationsFor(userId: number, limit: number): Promise<Notification[]>;
}

// Drizzle-backed store. `db` (and its tables) are imported lazily inside each
// method so this module can be imported in a Node unit test without a database.
export const drizzleChatStore: ChatStore = {
  async userIdByEmail(email) {
    const { db, users } = await import('@/lib/db');
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return u?.id ?? null;
  },

  async threadFor(candidateId) {
    const { db } = await import('@/lib/db');
    return db.query.messages.findMany({
      where: (msg, { eq }) => eq(msg.candidateId, candidateId),
      orderBy: (msg) => [asc(msg.createdAt), asc(msg.id)],
      with: {
        author: { columns: { firstName: true, lastName: true, email: true } },
        mentions: {
          with: {
            user: {
              columns: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      }
    });
  },

  async messageById(id) {
    const { db } = await import('@/lib/db');
    const [row] = await db.query.messages.findMany({
      where: (msg, { eq }) => eq(msg.id, id),
      limit: 1,
      with: {
        author: { columns: { firstName: true, lastName: true, email: true } },
        mentions: {
          with: {
            user: {
              columns: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      }
    });
    return row ?? null;
  },

  async existingUserIds(ids) {
    if (!ids.length) return [];
    const { db, users } = await import('@/lib/db');
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, ids));
    return rows.map((r) => r.id);
  },

  async insertMessage({ candidateId, authorId, body, mentionUserIds }) {
    const { db, messages, mentions } = await import('@/lib/db');
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(messages)
        .values({ candidateId, authorId, body })
        .returning({ id: messages.id });
      if (mentionUserIds.length) {
        await tx
          .insert(mentions)
          .values(
            mentionUserIds.map((userId) => ({ messageId: row.id, userId }))
          );
      }
      return row.id;
    });
  },

  async markMentionRead(mentionId, userId) {
    const { db, mentions } = await import('@/lib/db');
    await db
      .update(mentions)
      .set({ readAt: new Date() })
      // The userId predicate IS the authorization guard: a caller can only
      // clear a mention that targets their own account.
      .where(and(eq(mentions.id, mentionId), eq(mentions.userId, userId)));
  },

  async markAllMentionsRead(userId) {
    const { db, mentions } = await import('@/lib/db');
    await db
      .update(mentions)
      .set({ readAt: new Date() })
      .where(and(eq(mentions.userId, userId), isNull(mentions.readAt)));
  },

  async dismissMention(mentionId, userId) {
    const { db, mentions } = await import('@/lib/db');
    await db
      .update(mentions)
      .set({ dismissedAt: new Date() })
      // The userId predicate IS the authorization guard: a caller can only
      // clear a mention that targets their own account.
      .where(and(eq(mentions.id, mentionId), eq(mentions.userId, userId)));
  },

  async dismissAllMentions(userId) {
    const { db, mentions } = await import('@/lib/db');
    await db
      .update(mentions)
      .set({ dismissedAt: new Date() })
      .where(and(eq(mentions.userId, userId), isNull(mentions.dismissedAt)));
  },

  async notificationsFor(userId, limit) {
    const { db, users, messages, mentions, candidates } =
      await import('@/lib/db');
    const { displayName } = await import('../helpers');
    const rows = await db
      .select({
        id: mentions.id,
        readAt: mentions.readAt,
        messageId: messages.id,
        body: messages.body,
        createdAt: messages.createdAt,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
        authorEmail: users.email,
        candidateId: candidates.id,
        candidateName: candidates.name,
        jobId: candidates.jobId
      })
      .from(mentions)
      .innerJoin(messages, eq(mentions.messageId, messages.id))
      .innerJoin(candidates, eq(messages.candidateId, candidates.id))
      .innerJoin(users, eq(messages.authorId, users.id))
      // Scoped to the caller: only their own mentions that haven't been cleared.
      .where(and(eq(mentions.userId, userId), isNull(mentions.dismissedAt)))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      messageId: r.messageId,
      candidateId: r.candidateId,
      candidateName: r.candidateName,
      jobId: r.jobId,
      authorName: displayName({
        firstName: r.authorFirstName,
        lastName: r.authorLastName,
        email: r.authorEmail
      }),
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      read: r.readAt != null
    }));
  }
};
