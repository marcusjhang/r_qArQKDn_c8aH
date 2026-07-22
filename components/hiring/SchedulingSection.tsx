'use client';

// Drawer section for candidates in a scheduling stage (Screen/Interview): a
// "needs attention" flag, the candidate's real interviews (mark done / cancel),
// a SlotPicker to book a new one, and a manual touchpoint fallback for
// candidates with no real interview yet.

import { useCallback, useEffect, useState } from 'react';
import {
  founderById,
  scheduleReason,
  stageNeedsScheduling,
  INTERVIEW_DEFAULTS,
  type Candidate,
  type HiringActions,
  type ScheduleStatus
} from '@/lib/hiring';
import {
  listCandidateInterviews,
  markInterviewCompleted,
  cancelInterview
} from '@/lib/hiring/scheduling/actions';
import type { InterviewWithPanel } from '@/lib/hiring/scheduling/types';
import SlotPicker from '@/components/calendar/SlotPicker';
import { fmtDateTimeIso } from '@/components/calendar/util';
import Modal from './Modal';

/** Date → the `YYYY-MM-DDTHH:mm` a datetime-local input expects (local time). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export default function SchedulingSection({
  view,
  now,
  actions
}: {
  view: Candidate | null;
  now: number | null;
  actions: HiringActions;
}) {
  const [interviews, setInterviews] = useState<InterviewWithPanel[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const candidateId = view?.id ?? null;

  const loadInterviews = useCallback(() => {
    if (candidateId == null) return;
    listCandidateInterviews(candidateId).then(setInterviews);
  }, [candidateId]);

  useEffect(() => {
    setScheduling(false);
    setInterviews([]);
    if (candidateId != null) loadInterviews();
  }, [candidateId, loadInterviews]);

  if (!view || !stageNeedsScheduling(view.stage)) return null;

  // After an interview mutation the touchpoint fields change server-side;
  // resync the board store so the card chip updates, and refresh the list.
  function afterInterviewChange() {
    loadInterviews();
    actions.resync();
  }

  // Cancelled interviews are hidden from the list, so the manual fallback must
  // key off the same live set — otherwise a candidate whose only interview was
  // cancelled shows no interviews AND no manual control.
  const liveInterviews = interviews.filter((iv) => iv.status !== 'cancelled');
  const schedStatus: ScheduleStatus | null = view.scheduleStatus ?? null;
  const scheduledDate = view.scheduledAt ? new Date(view.scheduledAt) : null;
  const completedDate = view.completedAt ? new Date(view.completedAt) : null;
  const flag = now != null ? scheduleReason(view, now) : null;

  function pickManual(status: ScheduleStatus | null) {
    if (!view) return;
    if (status === 'scheduled') {
      actions.setSchedule(view.id, 'scheduled', scheduledDate ?? new Date());
    } else {
      actions.setSchedule(view.id, status, null);
    }
  }

  return (
    <div className="field sched-field">
      <span className="label">
        Interviews {flag && <span className="sched-flag">{flag}</span>}
      </span>

      {liveInterviews.length > 0 && (
        <ul className="iv-list">
          {liveInterviews.map((iv) => (
              <li key={iv.id} className={`iv-item is-${iv.status}`}>
                <div className="iv-item-main">
                  <span className="iv-item-when">
                    {iv.startsAt
                      ? fmtDateTimeIso(new Date(iv.startsAt).toISOString())
                      : 'Not booked'}
                  </span>
                  <span className="iv-item-meta">
                    {INTERVIEW_DEFAULTS[iv.type].label} ·{' '}
                    {iv.panel
                      .map((m) => founderById(m.founderId).initials)
                      .join(' ')}{' '}
                    · {iv.status}
                  </span>
                </div>
                {iv.status === 'scheduled' && (
                  <div className="iv-item-actions">
                    <button
                      className="linkbtn"
                      onClick={async () => {
                        await markInterviewCompleted(iv.id);
                        afterInterviewChange();
                      }}
                    >
                      Mark done
                    </button>
                    <button
                      className="linkbtn danger"
                      onClick={async () => {
                        await cancelInterview(iv.id, '');
                        afterInterviewChange();
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            ))}
        </ul>
      )}

      <button className="btn primary" onClick={() => setScheduling(true)}>
        ＋ Schedule interview
      </button>
      {scheduling && (
        <Modal title="Schedule interview" onClose={() => setScheduling(false)}>
          <SlotPicker
            candidateId={view.id}
            onScheduled={() => {
              setScheduling(false);
              afterInterviewChange();
            }}
          />
        </Modal>
      )}

      {liveInterviews.length === 0 && (
        <div className="sched-manual">
          <span className="label">Or set status manually</span>
          <div className="seg" role="group" aria-label="Touchpoint status">
            <button
              type="button"
              className={`seg-btn${schedStatus === null ? ' on' : ''}`}
              aria-pressed={schedStatus === null}
              onClick={() => pickManual(null)}
            >
              Not scheduled
            </button>
            <button
              type="button"
              className={`seg-btn${schedStatus === 'scheduled' ? ' on' : ''}`}
              aria-pressed={schedStatus === 'scheduled'}
              onClick={() => pickManual('scheduled')}
            >
              Scheduled
            </button>
            <button
              type="button"
              className={`seg-btn${schedStatus === 'completed' ? ' on' : ''}`}
              aria-pressed={schedStatus === 'completed'}
              onClick={() => pickManual('completed')}
            >
              Completed
            </button>
          </div>
          {schedStatus === 'scheduled' && (
            <input
              type="datetime-local"
              className="sched-input"
              value={scheduledDate ? toLocalInput(scheduledDate) : ''}
              onChange={(e) =>
                view &&
                actions.setSchedule(
                  view.id,
                  'scheduled',
                  e.target.value ? new Date(e.target.value) : new Date()
                )
              }
            />
          )}
          {schedStatus === 'completed' && (
            <div className="sched-note">
              {completedDate
                ? `Marked completed ${completedDate.toLocaleDateString()}`
                : 'Marked completed'}
              {' — move the candidate forward or reject to resolve.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
