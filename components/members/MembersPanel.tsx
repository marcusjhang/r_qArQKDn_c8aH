'use client';

// The members directory: every account with a derived, newest-first history of
// what they've done — feedback left and messages posted across the pipeline,
// plus the account-created event. The history is read server-side (see
// lib/members.ts) and handed in as props; this component is presentational.

import { formatMessageTime } from '@/lib/hiring';
import type { Member, MemberActivityKind } from '@/lib/members-types';

// A small glyph per action kind, so the timeline scans at a glance.
const KIND_ICON: Record<MemberActivityKind, string> = {
  joined: '🎉',
  feedback: '⭐',
  message: '💬'
};

export default function MembersPanel({ members }: { members: Member[] }) {
  return (
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">Members</p>
        <h1 className="settings-title">Team members</h1>
        <p className="settings-sub">
          Everyone with an account, and a history of what they&apos;ve done —
          feedback left and messages posted across the pipeline.
        </p>
      </div>

      <ul className="member-list">
        {members.length === 0 && (
          <li className="email-empty">No members yet.</li>
        )}
        {members.map((m) => (
          <li className="member-card" key={m.id}>
            <div className="member-head">
              <span className="avatar" aria-hidden>
                {m.initials}
              </span>
              <div className="member-id">
                <span className="member-name">{m.name}</span>
                <span className="member-email">{m.email}</span>
              </div>
              <div className="member-stats">
                <span title="Feedback left">⭐ {m.feedbackCount}</span>
                <span title="Messages posted">💬 {m.messageCount}</span>
              </div>
            </div>

            <ol className="activity-list">
              {m.activity.map((a) => (
                <li className="activity-row" key={a.id}>
                  <span className="activity-icon" aria-hidden>
                    {KIND_ICON[a.kind]}
                  </span>
                  <span className="activity-text">
                    {a.summary}
                    {a.candidateName && (
                      <span className="activity-target">
                        {' · '}
                        {a.candidateName}
                      </span>
                    )}
                  </span>
                  <time className="activity-time" dateTime={a.at}>
                    {formatMessageTime(a.at)}
                  </time>
                </li>
              ))}
              {m.activityTruncated && (
                <li className="activity-more">Older activity hidden</li>
              )}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}
