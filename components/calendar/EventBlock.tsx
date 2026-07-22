'use client';

import type { CSSProperties } from 'react';
import type { CalendarInterview } from '@/lib/hiring/scheduling/types';
import { INTERVIEW_DEFAULTS } from '@/lib/hiring/config';
import { founderColor, founderInitials, fmtTimeIso } from './util';

function leadId(iv: CalendarInterview): string {
  const lead = iv.panel.find((p) => p.role === 'lead') ?? iv.panel[0];
  return lead?.founderId ?? '';
}

export default function EventBlock({
  interview,
  style,
  compact,
  onOpen
}: {
  interview: CalendarInterview;
  style?: CSSProperties;
  compact?: boolean;
  onOpen: (iv: CalendarInterview) => void;
}) {
  const color = founderColor(leadId(interview));
  const typeLabel = INTERVIEW_DEFAULTS[interview.type].label;
  const stageMoved =
    !!interview.candidateStage &&
    !!interview.stageAtBooking &&
    interview.candidateStage !== interview.stageAtBooking;
  const timeLabel = interview.startsAt
    ? fmtTimeIso(new Date(interview.startsAt).toISOString())
    : 'TBD';
  const cls = ['cal-event', `is-${interview.status}`, compact ? 'compact' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      style={{ ...style, ['--iv' as string]: color }}
      title={`${interview.candidateName} · ${typeLabel} · ${timeLabel}`}
      onClick={() => onOpen(interview)}
    >
      <span className="cal-event-time">{timeLabel}</span>
      <span className="cal-event-name">{interview.candidateName}</span>
      {!compact && (
        <span className="cal-event-meta">
          {typeLabel}
          {' · '}
          {interview.panel.map((p) => founderInitials(p.founderId)).join(' ')}
        </span>
      )}
      {stageMoved && <span className="cal-event-flag" title="Candidate moved stage since this was booked">stage moved</span>}
    </button>
  );
}
