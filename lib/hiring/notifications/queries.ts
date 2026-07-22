import 'server-only';

// Owner-facing notifications. Two sources:
//  - a 'scheduled' event, written when an interview is booked (notifyScheduled)
//  - warning states, swept from the current candidate attention items on read
// Both dedupe via notifications.dedupeKey so owners aren't spammed.

import { db, notifications } from '@/lib/db';
import { COMPANY_TZ } from '../config';
import { attentionItems } from '../helpers';
import type { Candidate } from '../types';
import type { SelectNotification } from '@/lib/schema';

/** Insert one 'scheduled' notification for the candidate's owner (idempotent). */
export async function notifyScheduled(o: {
  ownerId: string;
  candidateId: number;
  candidateName: string;
  startsAt: Date;
  interviewId: number;
}) {
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: COMPANY_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(o.startsAt);
  await db
    .insert(notifications)
    .values({
      recipientFounderId: o.ownerId,
      candidateId: o.candidateId,
      kind: 'scheduled',
      message: `${o.candidateName}: interview scheduled for ${when}`,
      dedupeKey: `sched:${o.interviewId}`
    })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

/**
 * Turn each candidate's current attention items into notifications for its
 * owner. Deduped per candidate+kind, so a persistent warning notifies once.
 */
export async function syncOwnerWarningNotifications(now: number) {
  const rows = await db.query.candidates.findMany({
    columns: {
      id: true,
      name: true,
      owner: true,
      jobId: true,
      source: true,
      starred: true,
      stage: true,
      status: true,
      scheduleStatus: true,
      scheduledAt: true,
      completedAt: true,
      stageEnteredAt: true
    }
  });
  const values = rows.flatMap((r) =>
    // attentionItems ignores feedback; supply an empty list to satisfy the type.
    attentionItems({ ...r, feedback: [] } as Candidate, now).map((it) => ({
      recipientFounderId: r.owner,
      candidateId: r.id,
      kind: it.kind,
      message: `${r.name}: ${it.reason}`,
      dedupeKey: `warn:${r.id}:${it.kind}`
    }))
  );
  if (values.length) {
    await db
      .insert(notifications)
      .values(values)
      .onConflictDoNothing({ target: notifications.dedupeKey });
  }
}

/** Sweep current warnings, then return the notification feed (newest first). */
/**
 * Sweep current warnings, then return the feed newest-first. When
 * `recipientFounderId` is given, only that founder's notifications are returned
 * (the sweep still runs over every candidate so all owners' rows stay fresh).
 */
export async function getNotifications(
  recipientFounderId?: string
): Promise<SelectNotification[]> {
  await syncOwnerWarningNotifications(Date.now());
  return db.query.notifications.findMany({
    where: recipientFounderId
      ? (n, { eq }) => eq(n.recipientFounderId, recipientFounderId)
      : undefined,
    orderBy: (n, { desc }) => [desc(n.createdAt)],
    limit: 50
  });
}
