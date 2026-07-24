'use client';

// The members directory: every account with a derived, newest-first history of
// what they've done — feedback left and messages posted across the pipeline,
// plus the account-created event. The history is read server-side (see
// lib/members.ts) and handed in as props; this component is presentational.
// Each member's timeline is collapsible (collapsed by default) so the directory
// stays scannable — click the row to expand it.

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  PartyPopper,
  Star
} from 'lucide-react';
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
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
          Members
        </p>
        <h1 className="mb-1 text-[17px] font-bold">Team members</h1>
        <p className="text-[12.5px] text-muted-foreground">
          Everyone with an account. Click a member to see their activity.
        </p>
      </div>

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {members.length === 0 && (
          <li className="text-[12.5px] italic text-muted-foreground">
            No members yet.
          </li>
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
    <li className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent p-0 text-left text-inherit"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex-none text-muted-foreground" aria-hidden>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <Avatar aria-hidden>{member.initials}</Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-semibold">
            {member.name}
          </span>
          <span className="truncate text-[12px] text-muted-foreground">
            {member.email}
          </span>
        </div>
        <div className="flex flex-none gap-3 text-[12px] text-muted-foreground">
          <span title="Feedback left">
            <Star size={13} aria-hidden /> {member.feedbackCount}
          </span>
          <span title="Messages posted">
            <MessageSquare size={13} aria-hidden /> {member.messageCount}
          </span>
        </div>
      </button>

      {open && (
        <ol
          className="m-0 flex list-none flex-col gap-0.5 border-t border-border pt-2"
          id={panelId}
        >
          {activityCount === 0 && (
            <li className="pt-0.5 text-[11.5px] italic text-muted-foreground">
              No activity yet.
            </li>
          )}
          {member.activity.map((a) => {
            const Icon = KIND_ICON[a.kind];
            return (
            <li
              className="flex items-baseline gap-2 py-[3px] text-[12.5px]"
              key={a.id}
            >
              <span className="flex-none text-[12px]" aria-hidden>
                <Icon size={14} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {a.summary}
                {a.candidateName && (
                  <span className="text-muted-foreground">
                    {' · '}
                    {a.candidateName}
                  </span>
                )}
              </span>
              <time
                className="flex-none text-[11.5px] text-muted-foreground"
                dateTime={a.at}
              >
                {formatMessageTime(a.at)}
              </time>
            </li>
            );
          })}
          {member.activityTruncated && (
            <li className="pt-0.5 text-[11.5px] italic text-muted-foreground">
              Older activity hidden
            </li>
          )}
        </ol>
      )}
    </li>
  );
}
