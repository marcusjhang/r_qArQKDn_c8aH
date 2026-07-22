import 'server-only';

// Server-side reads for the mention notification inbox. Loaded by the dashboard
// server component (page.tsx) and handed to the client; the client triggers
// further reads/writes through ./chat-actions. The pool of accounts that can be
// @-mentioned is the board's canonical user list (HiringState.users), so the
// chat does not query users separately.

import { desc, eq } from 'drizzle-orm';
import { db, users, messages, mentions, candidates } from '@/lib/db';
import { displayName } from './helpers';
import type { Notification } from './types';

/**
 * The mentions targeting one user, newest first — the notification inbox.
 * Joins through to the message and its candidate so each row can deep-link to
 * the applicant's chat. `read` folds `readAt` into a boolean for the UI.
 */
export async function getNotifications(
  userId: number,
  limit = 50
): Promise<Notification[]> {
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
    .where(eq(mentions.userId, userId))
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
