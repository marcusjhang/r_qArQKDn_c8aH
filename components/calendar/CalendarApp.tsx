'use client';

// Shared interview calendar: a Week view + an availability editor, filterable
// by job and interviewer. Built entirely in the board's scoped .ht-root design
// system (no calendar library).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TopBar from '@/components/hiring/TopBar';
import Modal from '@/components/hiring/Modal';
import { FOUNDERS, INTERVIEW_DEFAULTS } from '@/lib/hiring/config';
import {
  cancelInterview,
  markInterviewCompleted,
  markNoShow
} from '@/lib/hiring/scheduling/actions';
import type {
  Availability,
  AvailabilityException,
  CalendarInterview
} from '@/lib/hiring/scheduling/types';
import TimeGrid from './TimeGrid';
import AvailabilityEditor from './AvailabilityEditor';
import {
  addDaysYmd,
  dayLabel,
  fmtDateTimeIso,
  founderName,
  todayYmd,
  weekDates,
  weekMonday
} from './util';
import '@/components/hiring/hiring.css';

type View = 'week' | 'availability';

export default function CalendarApp({
  initial,
  userEmail,
  currentFounderId
}: {
  initial: {
    interviews: CalendarInterview[];
    availability: Availability[];
    exceptions: AvailabilityException[];
    interviewerSettings: Record<string, boolean>;
  };
  userEmail?: string | null;
  currentFounderId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<string>(todayYmd());
  const [jobFilter, setJobFilter] = useState<number | null>(null);
  const [founderFilter, setFounderFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<CalendarInterview | null>(null);

  const monday = weekMonday(anchor);
  const days = weekDates(monday);

  const jobOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const iv of initial.interviews) m.set(iv.jobId, iv.jobTitle);
    return [...m.entries()].map(([id, title]) => ({ id, title }));
  }, [initial.interviews]);

  const interviews = useMemo(
    () =>
      initial.interviews.filter(
        (iv) =>
          (jobFilter == null || iv.jobId === jobFilter) &&
          (founderFilter == null ||
            iv.panel.some((p) => p.founderId === founderFilter))
      ),
    [initial.interviews, jobFilter, founderFilter]
  );

  function shiftWeek(dir: number) {
    setAnchor((a) => addDaysYmd(weekMonday(a), dir * 7));
  }

  async function act(fn: () => Promise<unknown>) {
    await fn();
    setOpen(null);
    router.refresh();
  }

  return (
    <div className="ht-root">
      <TopBar
        subtitle="Calendar"
        userEmail={userEmail}
        nav={[
          { href: '/', label: '← Board' },
          { href: '/settings', label: '⚙ Settings' }
        ]}
      >
        <div className="cal-toolbar">
          <div className="seg cal-views">
            {(['week', 'availability'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                className={`seg-btn${view === v ? ' on' : ''}`}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {view !== 'availability' && (
            <div className="cal-nav">
              <button className="btn" onClick={() => shiftWeek(-1)}>
                ‹
              </button>
              <button className="btn" onClick={() => setAnchor(todayYmd())}>
                Today
              </button>
              <button className="btn" onClick={() => shiftWeek(1)}>
                ›
              </button>
              <span className="cal-range">
                {`${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}`}
              </span>
            </div>
          )}

          <div className="spacer" />

          {view !== 'availability' && (
            <>
              <select
                className="cal-filter"
                value={jobFilter ?? ''}
                onChange={(e) =>
                  setJobFilter(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">All jobs</option>
                {jobOptions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
              <select
                className="cal-filter"
                value={founderFilter ?? ''}
                onChange={(e) => setFounderFilter(e.target.value || null)}
              >
                <option value="">All interviewers</option>
                {FOUNDERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </TopBar>

      <div className="cal-wrap">
        {view === 'availability' ? (
          <AvailabilityEditor
            availability={initial.availability}
            exceptions={initial.exceptions}
            interviewerSettings={initial.interviewerSettings}
            currentFounderId={currentFounderId}
          />
        ) : (
          <TimeGrid days={days} interviews={interviews} onOpen={setOpen} />
        )}
      </div>

      {open && (
        <Modal title="Interview" onClose={() => setOpen(null)}>
          <div className="iv-detail">
            <div className="iv-row">
              <span className="label">Candidate</span>
              <span>{open.candidateName}</span>
            </div>
            <div className="iv-row">
              <span className="label">Role · type</span>
              <span>
                {open.jobTitle} · {INTERVIEW_DEFAULTS[open.type].label}
              </span>
            </div>
            <div className="iv-row">
              <span className="label">When</span>
              <span>
                {open.startsAt
                  ? fmtDateTimeIso(new Date(open.startsAt).toISOString())
                  : 'Not booked'}
              </span>
            </div>
            <div className="iv-row">
              <span className="label">Panel</span>
              <span>
                {open.panel
                  .map(
                    (p) =>
                      `${founderName(p.founderId)}${p.role === 'lead' ? ' (lead)' : ''}`
                  )
                  .join(', ')}
              </span>
            </div>
            <div className="iv-row">
              <span className="label">Status</span>
              <span className={`status-pill st-${open.status}`}>{open.status}</span>
            </div>

            {open.status === 'scheduled' && (
              <div className="iv-actions">
                <button
                  className="btn primary"
                  onClick={() => act(() => markInterviewCompleted(open.id))}
                >
                  Mark completed
                </button>
                <button className="btn" onClick={() => act(() => markNoShow(open.id))}>
                  No-show
                </button>
                <button
                  className="btn danger"
                  onClick={() => act(() => cancelInterview(open.id, ''))}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
