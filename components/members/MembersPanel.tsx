'use client';

// The members directory: every account with a derived, newest-first history of
// what they've done — feedback left and messages posted across the pipeline,
// plus the account-created event. The history is read server-side (see
// lib/members.ts) and handed in as props; this component is presentational.
// Each member's timeline is collapsible (collapsed by default) so the directory
// stays scannable — click the row to expand it.

import { useState } from 'react';
import { MessageSquare, PartyPopper, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatMessageTime } from '@/lib/hiring';
import { Avatar } from '@/components/ui/avatar';
import type { Member, MemberActivityKind } from '@/lib/members-types';

// A small icon per action kind, so the timeline scans at a glance.
const KIND_ICON: Record<MemberActivityKind, LucideIcon> = {
  joined: PartyPopper,
  feedback: Star,
  message: MessageSquare
};

export default function MembersPanel({ members }: { members: Member[] }) {
  return (
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">Members</p>
        <h1 className="settings-title">Team members</h1>
        <p className="settings-sub">
          Everyone with an account. Click a member to see their activity.
        </p>
      </div>

      <ul className="member-list">
        {members.length === 0 && (
          <li className="email-empty">No members yet.</li>
        )}
        {members.map((m) => (
          <MemberCard key={m.id} member={m} />
        ))}
      </ul>
    </section>
  );
}

function MemberCard({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const activityCount = member.feedbackCount + member.messageCount;
  const panelId = `member-activity-${member.id}`;

  return (
    <li className="member-card">
      <button
        type="button"
        className="member-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="member-caret" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <Avatar aria-hidden>{member.initials}</Avatar>
        <div className="member-id">
          <span className="member-name">{member.name}</span>
          <span className="member-email">{member.email}</span>
        </div>
        <div className="member-stats">
          <span title="Feedback left">
            <Star size={13} aria-hidden /> {member.feedbackCount}
          </span>
          <span title="Messages posted">
            <MessageSquare size={13} aria-hidden /> {member.messageCount}
          </span>
        </div>
      </button>

      {open && (
        <ol className="activity-list" id={panelId}>
          {activityCount === 0 && (
            <li className="activity-more">No activity yet.</li>
          )}
          {member.activity.map((a) => {
            const Icon = KIND_ICON[a.kind];
            return (
            <li className="activity-row" key={a.id}>
              <span className="activity-icon" aria-hidden>
                <Icon size={14} />
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
            );
          })}
          {member.activityTruncated && (
            <li className="activity-more">Older activity hidden</li>
          )}
        </ol>
      )}
    </li>
  );
}
