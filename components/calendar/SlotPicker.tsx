'use client';

// Drawer widget: pick an interview type, choose an available slot, then build
// the panel — either tap interviewers manually or hit "Suggest panel" to fill
// it from the rules-based fresh-panel picker. All data comes from scheduling
// server actions.

import { useEffect, useState } from 'react';
import { FOUNDERS, INTERVIEW_DEFAULTS } from '@/lib/hiring/config';
import { INTERVIEW_TYPES } from '@/lib/hiring/primitives';
import type { InterviewType } from '@/lib/hiring/types';
import {
  getSlotsForCandidate,
  suggestPanelForSlot,
  scheduleInterviewDirect,
  listInterviewers
} from '@/lib/hiring/scheduling/actions';
import type { Slot } from '@/lib/hiring/scheduling/types';
import { dayLabel, fmtTimeIso, founderName, localParts } from './util';

export default function SlotPicker({
  candidateId,
  onScheduled
}: {
  candidateId: number;
  onScheduled: () => void;
}) {
  const [type, setType] = useState<InterviewType>('interview');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState('');
  const [interviewerIds, setInterviewerIds] = useState<string[]>([]);

  // Load the interviewer roster once (for the panel override list).
  useEffect(() => {
    let live = true;
    listInterviewers().then((ids) => {
      if (live) setInterviewerIds(ids);
    });
    return () => {
      live = false;
    };
  }, []);

  // (Re)load slots whenever the type changes.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setPicked(null);
    setPanelIds([]);
    setError('');
    getSlotsForCandidate(candidateId, type).then((s) => {
      if (live) {
        setSlots(s);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [candidateId, type]);

  // Picking a slot no longer auto-suggests — the panel starts empty and the
  // recruiter either taps interviewers or asks for a suggestion (below). A new
  // slot clears any prior panel since availability differs per slot.
  function pick(iso: string) {
    setPicked(iso);
    setPanelIds([]);
    setError('');
  }

  async function suggest() {
    if (!picked) return;
    setSuggesting(true);
    try {
      const panel = await suggestPanelForSlot(candidateId, type, picked);
      setPanelIds(panel.map((p) => p.founderId));
    } finally {
      setSuggesting(false);
    }
  }

  function togglePanel(id: string) {
    setPanelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function schedule() {
    if (!picked || panelIds.length === 0) return;
    setBusy(true);
    setError('');
    const res = await scheduleInterviewDirect(candidateId, {
      type,
      slotStartIso: picked,
      panel: panelIds.map((founderId, i) => ({
        founderId,
        role: i === 0 ? 'lead' : 'interviewer'
      }))
    });
    setBusy(false);
    if (res.ok) {
      onScheduled();
    } else if (res.error === 'SLOT_TAKEN') {
      setError('That slot was just taken — pick another.');
      setPicked(null);
      const s = await getSlotsForCandidate(candidateId, type);
      setSlots(s);
    } else {
      setError('Could not schedule. Try again.');
    }
  }

  // Group slots by local day for display.
  const byDay: { ymd: string; slots: Slot[] }[] = [];
  for (const s of slots) {
    const ymd = localParts(s.startIso).ymd;
    const last = byDay[byDay.length - 1];
    if (last && last.ymd === ymd) last.slots.push(s);
    else byDay.push({ ymd, slots: [s] });
  }

  const def = INTERVIEW_DEFAULTS[type];

  return (
    <div className="slot-picker">
      <div className="field">
        <span className="label">Interview type</span>
        <div className="seg">
          {INTERVIEW_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`seg-btn${type === t ? ' on' : ''}`}
              onClick={() => setType(t)}
            >
              {INTERVIEW_DEFAULTS[t].label}
            </button>
          ))}
        </div>
        <div className="slot-hint">
          {def.durationMin} min · panel of {def.panelSize}
        </div>
      </div>

      {loading ? (
        <div className="fb-empty">Finding open times…</div>
      ) : byDay.length === 0 ? (
        <div className="fb-empty">
          No open slots — check interviewer availability on the calendar.
        </div>
      ) : (
        <div className="slot-days">
          {byDay.map((d) => (
            <div key={d.ymd} className="slot-day">
              <div className="slot-day-label">{dayLabel(d.ymd)}</div>
              <div className="slot-chips">
                {d.slots.map((s) => (
                  <button
                    key={s.startIso}
                    type="button"
                    className={`slot-chip${picked === s.startIso ? ' on' : ''}`}
                    onClick={() => pick(s.startIso)}
                  >
                    {fmtTimeIso(s.startIso)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {picked && (
        <div className="field slot-panel">
          <div className="panel-head">
            <span className="label">Panel — tap to choose</span>
            <button
              type="button"
              className="linkbtn"
              disabled={suggesting}
              onClick={suggest}
            >
              {suggesting ? 'Suggesting…' : '✨ Suggest panel'}
            </button>
          </div>
          <div className="panel-toggles">
            {FOUNDERS.filter((f) => interviewerIds.includes(f.id)).map((f) => {
              const on = panelIds.includes(f.id);
              const isLead = panelIds[0] === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`panel-toggle${on ? ' on' : ''}`}
                  onClick={() => togglePanel(f.id)}
                >
                  {founderName(f.id)}
                  {on && isLead && <span className="panel-lead">lead</span>}
                </button>
              );
            })}
          </div>
          {error && <div className="form-error">{error}</div>}
          <button
            className="btn primary"
            disabled={busy || panelIds.length === 0}
            onClick={schedule}
          >
            {busy ? 'Scheduling…' : `Schedule ${INTERVIEW_DEFAULTS[type].label}`}
          </button>
        </div>
      )}
    </div>
  );
}
