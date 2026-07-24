import 'server-only';

// Members directory + per-member activity history for the /members page. With no
// audit-log table, a member's history is derived from the user-attributed events
// the app already records (feedback, messages, plus the account-created event).

import { eq } from 'drizzle-orm';
import { db, users, feedback, messages, candidates } from '@/lib/db';
import { displayName, initials } from '@/lib/hiring/helpers';
import type { Member, MemberActivity } from './members-types';

/** Most recent actions kept per member; older ones are trimmed (and flagged). */
const MEMBER_ACTIVITY_LIMIT = 20;

/** Every member with a newest-first history, ordered by most-recent activity (ties by name). */
export async function getMembers(): Promise<Member[]> {
  const [userRows, feedbackRows, messageRows] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        createdAt: users.createdAt
      })
      .from(users),
    // Join through to the candidate so each event can name who it was about.
    db
      .select({
        id: feedback.id,
        byUser: feedback.byUser,
        traitScores: feedback.traitScores,
        createdAt: feedback.createdAt,
        candidateName: candidates.name
      })
      .from(feedback)
      .innerJoin(candidates, eq(feedback.candidateId, candidates.id)),
    db
      .select({
        id: messages.id,
        authorId: messages.authorId,
        body: messages.body,
        createdAt: messages.createdAt,
        candidateName: candidates.name
      })
      .from(messages)
      .innerJoin(candidates, eq(messages.candidateId, candidates.id))
  ]);

  // Bucket the attributed events by the user who performed them.
  const eventsByUser = new Map<number, MemberActivity[]>();
  const record = (userId: number, event: MemberActivity) => {
    const list = eventsByUser.get(userId);
    if (list) list.push(event);
    else eventsByUser.set(userId, [event]);
  };

  for (const f of feedbackRows) {
    record(f.byUser, {
      id: `feedback-${f.id}`,
      kind: 'feedback',
      at: f.createdAt.toISOString(),
      summary: feedbackSummary(f.traitScores),
      candidateName: f.candidateName
    });
  }
  for (const m of messageRows) {
    record(m.authorId, {
      id: `message-${m.id}`,
      kind: 'message',
      at: m.createdAt.toISOString(),
      summary: messageSummary(m.body),
      candidateName: m.candidateName
    });
  }

  const members = userRows.map((u): Member => {
    const joinedAt = u.createdAt.toISOString();
    const events = eventsByUser.get(u.id) ?? [];
    const feedbackCount = events.filter((e) => e.kind === 'feedback').length;
    const messageCount = events.filter((e) => e.kind === 'message').length;

    // Anchor every timeline with the account-created event, newest first.
    const timeline = [
      ...events,
      {
        id: `joined-${u.id}`,
        kind: 'joined' as const,
        at: joinedAt,
        summary: 'Joined the workspace',
        candidateName: null
      }
    ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    return {
      id: u.id,
      name: displayName(u),
      initials: initials(u),
      email: u.email,
      joinedAt,
      feedbackCount,
      messageCount,
      activity: timeline.slice(0, MEMBER_ACTIVITY_LIMIT),
      activityTruncated: timeline.length > MEMBER_ACTIVITY_LIMIT
    };
  });

  members.sort((a, b) => {
    const aAt = a.activity[0]?.at ?? a.joinedAt;
    const bAt = b.activity[0]?.at ?? b.joinedAt;
    if (aAt !== bAt) return aAt < bAt ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return members;
}

/** One-line summary of a feedback event: how many traits were scored and their average. */
function feedbackSummary(raw: unknown): string {
  // jsonb normally arrives parsed; tolerate a stringified value defensively.
  const scoresObj =
    typeof raw === 'string'
      ? (JSON.parse(raw) as Record<string, number>)
      : ((raw ?? {}) as Record<string, number>);
  const scores = Object.values(scoresObj);
  if (!scores.length) return 'Left feedback';
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return `Scored ${scores.length} trait${scores.length === 1 ? '' : 's'} (avg ${avg.toFixed(1)})`;
}

/** Collapse a chat message to a one-line summary for the activity timeline. */
function messageSummary(body: string, max = 80): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  if (!oneLine) return 'Posted a message';
  const clipped =
    oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
  return `Posted “${clipped}”`;
}
