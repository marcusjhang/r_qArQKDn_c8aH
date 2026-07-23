import { describe, it, expect } from 'vitest';
import {
  dismissAllNotificationsWith,
  dismissNotificationWith,
  getNotificationsWith,
  loadThreadWith,
  markAllNotificationsReadWith,
  markNotificationReadWith,
  postMessageWith
} from '@/lib/hiring/chat-logic';
import type { ChatStore, MessageRow } from '@/lib/hiring/chat-store';
import type { Notification } from '@/lib/hiring/types';

// The chat logic reads and writes through an injectable ChatStore (rather than
// the db singleton), so it can be exercised against an in-memory fake — no
// database, no DATABASE_URL, no mocking of Drizzle's query builder. The fake
// below is a tiny relational store that honors the SAME per-user scoping the
// Drizzle store enforces in SQL, so the tests can assert the notification
// authorization guard directly.

interface FakeUser {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
}
interface FakeCandidate {
  id: number;
  jobId: number;
  name: string;
}
interface FakeMessage {
  id: number;
  candidateId: number;
  authorId: number;
  body: string;
  createdAt: Date;
}
interface FakeMention {
  id: number;
  messageId: number;
  userId: number;
  readAt: Date | null;
  dismissedAt: Date | null;
}

class FakeChatStore implements ChatStore {
  users: FakeUser[] = [];
  candidates: FakeCandidate[] = [];
  messages: FakeMessage[] = [];
  mentions: FakeMention[] = [];
  private nextMessageId = 1;
  private nextMentionId = 1;

  private userById(id: number): FakeUser | null {
    return this.users.find((u) => u.id === id) ?? null;
  }

  private toRow(m: FakeMessage): MessageRow {
    const author = this.userById(m.authorId);
    return {
      id: m.id,
      candidateId: m.candidateId,
      authorId: m.authorId,
      body: m.body,
      createdAt: m.createdAt,
      author: author
        ? {
            firstName: author.firstName,
            lastName: author.lastName,
            email: author.email
          }
        : null,
      mentions: this.mentions
        .filter((x) => x.messageId === m.id)
        .map((x) => {
          const u = this.userById(x.userId);
          return {
            user: u
              ? {
                  id: u.id,
                  firstName: u.firstName,
                  lastName: u.lastName,
                  email: u.email
                }
              : null
          };
        })
    };
  }

  async userIdByEmail(email: string): Promise<number | null> {
    return this.users.find((u) => u.email === email)?.id ?? null;
  }

  async threadFor(candidateId: number): Promise<MessageRow[]> {
    return this.messages
      .filter((m) => m.candidateId === candidateId)
      .sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id
      )
      .map((m) => this.toRow(m));
  }

  async messageById(id: number): Promise<MessageRow | null> {
    const m = this.messages.find((x) => x.id === id);
    return m ? this.toRow(m) : null;
  }

  async existingUserIds(ids: number[]): Promise<number[]> {
    return ids.filter((id) => this.users.some((u) => u.id === id));
  }

  async insertMessage(input: {
    candidateId: number;
    authorId: number;
    body: string;
    mentionUserIds: number[];
  }): Promise<number> {
    const id = this.nextMessageId++;
    this.messages.push({
      id,
      candidateId: input.candidateId,
      authorId: input.authorId,
      body: input.body,
      createdAt: new Date()
    });
    for (const userId of input.mentionUserIds) {
      this.mentions.push({
        id: this.nextMentionId++,
        messageId: id,
        userId,
        readAt: null,
        dismissedAt: null
      });
    }
    return id;
  }

  async markMentionRead(mentionId: number, userId: number): Promise<void> {
    // Mirrors the SQL guard: only a mention that BOTH matches the id AND belongs
    // to `userId` is touched. A mismatched userId is a no-op.
    const m = this.mentions.find(
      (x) => x.id === mentionId && x.userId === userId
    );
    if (m) m.readAt = new Date();
  }

  async markAllMentionsRead(userId: number): Promise<void> {
    for (const m of this.mentions) {
      if (m.userId === userId && m.readAt == null) m.readAt = new Date();
    }
  }

  async dismissMention(mentionId: number, userId: number): Promise<void> {
    // Mirrors the SQL guard: only a mention that BOTH matches the id AND belongs
    // to `userId` is touched. A mismatched userId is a no-op.
    const m = this.mentions.find(
      (x) => x.id === mentionId && x.userId === userId
    );
    if (m) m.dismissedAt = new Date();
  }

  async dismissAllMentions(userId: number): Promise<void> {
    for (const m of this.mentions) {
      if (m.userId === userId && m.dismissedAt == null) m.dismissedAt = new Date();
    }
  }

  async notificationsFor(
    userId: number,
    limit: number
  ): Promise<Notification[]> {
    return this.mentions
      .filter((x) => x.userId === userId && x.dismissedAt == null)
      .map((x) => {
        const msg = this.messages.find((m) => m.id === x.messageId)!;
        const cand = this.candidates.find((c) => c.id === msg.candidateId)!;
        const author = this.userById(msg.authorId);
        return {
          id: x.id,
          messageId: msg.id,
          candidateId: cand.id,
          candidateName: cand.name,
          jobId: cand.jobId,
          authorName:
            [author?.firstName, author?.lastName].filter(Boolean).join(' ') ||
            author?.email ||
            'Unknown',
          body: msg.body,
          createdAt: msg.createdAt.toISOString(),
          read: x.readAt != null,
          _sortAt: msg.createdAt.getTime()
        } as Notification & { _sortAt: number };
      })
      .sort((a, b) => b._sortAt - a._sortAt)
      .slice(0, limit)
      .map(({ _sortAt, ...n }) => n);
  }
}

const alice: FakeUser = {
  id: 1,
  firstName: 'Alice',
  lastName: 'Ng',
  email: 'alice@example.com'
};
const bob: FakeUser = {
  id: 2,
  firstName: 'Bob',
  lastName: 'Lim',
  email: 'bob@example.com'
};

function seed(): FakeChatStore {
  const store = new FakeChatStore();
  store.users = [alice, bob];
  store.candidates = [{ id: 10, jobId: 100, name: 'Ada Lovelace' }];
  return store;
}

describe('loadThreadWith', () => {
  it('returns a candidate thread oldest-first as ChatMessages', async () => {
    const store = seed();
    await postMessageWith(store, alice.email, 10, 'first', []);
    await postMessageWith(store, bob.email, 10, 'second', []);
    const thread = await loadThreadWith(store, 10);
    expect(thread.map((m) => m.body)).toEqual(['first', 'second']);
    expect(thread[0].authorName).toBe('Alice Ng');
    expect(thread[0].authorInitials).toBe('AN');
    expect(thread[0].candidateId).toBe(10);
  });

  it('rejects a non-positive candidate id (zod guard)', async () => {
    const store = seed();
    await expect(loadThreadWith(store, 0)).rejects.toThrow();
  });
});

describe('postMessageWith', () => {
  it('returns null and writes nothing when the caller is not signed in', async () => {
    const store = seed();
    const res = await postMessageWith(store, null, 10, 'hi', [bob.id]);
    expect(res).toBeNull();
    expect(store.messages).toHaveLength(0);
    expect(store.mentions).toHaveLength(0);
  });

  it('returns null for an email that resolves to no account', async () => {
    const store = seed();
    const res = await postMessageWith(store, 'ghost@example.com', 10, 'hi', []);
    expect(res).toBeNull();
    expect(store.messages).toHaveLength(0);
  });

  it('persists the message and returns the shaped row', async () => {
    const store = seed();
    const msg = await postMessageWith(store, alice.email, 10, '  hello  ', []);
    expect(msg).not.toBeNull();
    expect(msg!.body).toBe('hello'); // trimmed by zBody
    expect(msg!.authorId).toBe(alice.id);
    expect(store.messages).toHaveLength(1);
  });

  it('fans out mentions to real accounts, deduped and excluding the author', async () => {
    const store = seed();
    // Mentions include the author (alice), a duplicate of bob, and a
    // non-existent user 999.
    const msg = await postMessageWith(store, alice.email, 10, 'hey @Bob', [
      alice.id,
      bob.id,
      bob.id,
      999
    ]);
    expect(msg!.mentions).toEqual([{ userId: bob.id, name: 'Bob Lim' }]);
    // Only bob got a mention row; alice (author) and 999 (fake) did not.
    expect(store.mentions.map((m) => m.userId)).toEqual([bob.id]);
  });

  it('rejects an empty message body (zod guard)', async () => {
    const store = seed();
    await expect(
      postMessageWith(store, alice.email, 10, '   ', [])
    ).rejects.toThrow();
  });
});

describe('getNotificationsWith', () => {
  it('returns only the mentions targeting the given user, newest first', async () => {
    const store = seed();
    await postMessageWith(store, alice.email, 10, 'ping bob', [bob.id]);
    await postMessageWith(store, bob.email, 10, 'ping alice', [alice.id]);

    const bobInbox = await getNotificationsWith(store, bob.id);
    expect(bobInbox).toHaveLength(1);
    expect(bobInbox[0].body).toBe('ping bob');
    expect(bobInbox[0].authorName).toBe('Alice Ng');
    expect(bobInbox[0].candidateName).toBe('Ada Lovelace');
    expect(bobInbox[0].read).toBe(false);

    const aliceInbox = await getNotificationsWith(store, alice.id);
    expect(aliceInbox).toHaveLength(1);
    expect(aliceInbox[0].body).toBe('ping alice');
  });

  it('honors the limit argument', async () => {
    const store = seed();
    await postMessageWith(store, alice.email, 10, 'one', [bob.id]);
    await postMessageWith(store, alice.email, 10, 'two', [bob.id]);
    await postMessageWith(store, alice.email, 10, 'three', [bob.id]);
    const inbox = await getNotificationsWith(store, bob.id, 2);
    expect(inbox).toHaveLength(2);
  });
});

// The authorization guard: a caller must not be able to read OR act on another
// user's mention notifications.
describe('notification authorization guard', () => {
  it('getNotifications never leaks another user’s mentions', async () => {
    const store = seed();
    // A message mentioning bob only.
    await postMessageWith(store, alice.email, 10, 'only bob', [bob.id]);
    // Alice must not see bob's mention in her inbox.
    const aliceInbox = await getNotificationsWith(store, alice.id);
    expect(aliceInbox).toHaveLength(0);
  });

  it('markNotificationRead cannot clear a mention that belongs to another user', async () => {
    const store = seed();
    await postMessageWith(store, alice.email, 10, 'for bob', [bob.id]);
    const bobMention = store.mentions.find((m) => m.userId === bob.id)!;
    expect(bobMention.readAt).toBeNull();

    // Alice attempts to mark bob's mention read using bob's mention id.
    await markNotificationReadWith(store, alice.email, bobMention.id);

    // Guard holds: bob's mention is still unread.
    expect(
      store.mentions.find((m) => m.id === bobMention.id)!.readAt
    ).toBeNull();
    // And bob can still mark his own mention read.
    await markNotificationReadWith(store, bob.email, bobMention.id);
    expect(
      store.mentions.find((m) => m.id === bobMention.id)!.readAt
    ).not.toBeNull();
  });

  it('markNotificationRead is a no-op when the caller is not signed in', async () => {
    const store = seed();
    await postMessageWith(store, alice.email, 10, 'for bob', [bob.id]);
    const bobMention = store.mentions.find((m) => m.userId === bob.id)!;
    await markNotificationReadWith(store, null, bobMention.id);
    expect(
      store.mentions.find((m) => m.id === bobMention.id)!.readAt
    ).toBeNull();
  });

  it('markAllNotificationsRead only clears the caller’s own mentions', async () => {
    const store = seed();
    // Alice mentions bob; bob mentions alice — each inbox has one unread.
    await postMessageWith(store, alice.email, 10, 'to bob', [bob.id]);
    await postMessageWith(store, bob.email, 10, 'to alice', [alice.id]);

    await markAllNotificationsReadWith(store, bob.email);

    const bobMention = store.mentions.find((m) => m.userId === bob.id)!;
    const aliceMention = store.mentions.find((m) => m.userId === alice.id)!;
    // Bob's mention is cleared; alice's is untouched.
    expect(bobMention.readAt).not.toBeNull();
    expect(aliceMention.readAt).toBeNull();
  });

  it('markAllNotificationsRead is a no-op when the caller is not signed in', async () => {
    const store = seed();
    await postMessageWith(store, alice.email, 10, 'to bob', [bob.id]);
    await markAllNotificationsReadWith(store, null);
    expect(store.mentions.every((m) => m.readAt == null)).toBe(true);
  });

  it('dismissNotification cannot clear a mention that belongs to another user', async () => {
    const store = seed();
    await postMessageWith(store, alice.email, 10, 'for bob', [bob.id]);
    const bobMention = store.mentions.find((m) => m.userId === bob.id)!;

    // Alice attempts to dismiss bob's mention using bob's mention id.
    await dismissNotificationWith(store, alice.email, bobMention.id);

    // Guard holds: bob's mention is still in his inbox.
    expect(
      store.mentions.find((m) => m.id === bobMention.id)!.dismissedAt
    ).toBeNull();
    expect(await getNotificationsWith(store, bob.id)).toHaveLength(1);

    // And bob can clear his own mention — it drops out of his inbox.
    await dismissNotificationWith(store, bob.email, bobMention.id);
    expect(
      store.mentions.find((m) => m.id === bobMention.id)!.dismissedAt
    ).not.toBeNull();
    expect(await getNotificationsWith(store, bob.id)).toHaveLength(0);
  });

  it('dismissNotification is a no-op when the caller is not signed in', async () => {
    const store = seed();
    await postMessageWith(store, alice.email, 10, 'for bob', [bob.id]);
    const bobMention = store.mentions.find((m) => m.userId === bob.id)!;
    await dismissNotificationWith(store, null, bobMention.id);
    expect(
      store.mentions.find((m) => m.id === bobMention.id)!.dismissedAt
    ).toBeNull();
  });

  it('dismissAllNotifications only clears the caller’s own mentions', async () => {
    const store = seed();
    // Alice mentions bob; bob mentions alice — each inbox has one.
    await postMessageWith(store, alice.email, 10, 'to bob', [bob.id]);
    await postMessageWith(store, bob.email, 10, 'to alice', [alice.id]);

    await dismissAllNotificationsWith(store, bob.email);

    // Bob's inbox is empty; alice's is untouched.
    expect(await getNotificationsWith(store, bob.id)).toHaveLength(0);
    expect(await getNotificationsWith(store, alice.id)).toHaveLength(1);
  });

  it('dismissAllNotifications is a no-op when the caller is not signed in', async () => {
    const store = seed();
    await postMessageWith(store, alice.email, 10, 'to bob', [bob.id]);
    await dismissAllNotificationsWith(store, null);
    expect(store.mentions.every((m) => m.dismissedAt == null)).toBe(true);
  });

  it('a dismissed notification does not reappear after being marked read', async () => {
    const store = seed();
    await postMessageWith(store, alice.email, 10, 'for bob', [bob.id]);
    const bobMention = store.mentions.find((m) => m.userId === bob.id)!;

    await dismissNotificationWith(store, bob.email, bobMention.id);
    await markNotificationReadWith(store, bob.email, bobMention.id);

    // Dismissed stays out of the inbox regardless of read state.
    expect(await getNotificationsWith(store, bob.id)).toHaveLength(0);
  });
});
