'use client';

// Slide-over candidate detail (Decisions 4, 5 & 7): owner/status/source
// controls, per-interviewer feedback list + add-feedback form with the
// 4-point rating picker, and Advance/Back stage controls. The board stays
// visible behind the drawer so pipeline context is never lost.

import { useEffect, useRef } from 'react';
import { FOUNDERS, RATINGS, SOURCES, STATUS } from '@/lib/hiring/config';
import { agg, founderById } from '@/lib/hiring/helpers';
import type { HiringActions } from '@/lib/hiring/store';
import type { Candidate, HiringState, RatingValue, Status } from '@/lib/hiring/types';
import { useFeedbackDraft } from './useFeedbackDraft';

const RATING_ORDER: RatingValue[] = [1, 2, 3, 4];

export default function DetailDrawer({
  state,
  actions,
  openId,
  onClose
}: {
  state: HiringState;
  actions: HiringActions;
  openId: number | null;
  onClose: () => void;
}) {
  const candidate =
    openId == null ? null : state.candidates.find((c) => c.id === openId) ?? null;

  // Keep the last shown candidate so content stays put during the slide-out.
  const lastRef = useRef<Candidate | null>(null);
  if (candidate) lastRef.current = candidate;
  const view = candidate ?? lastRef.current;
  const open = candidate != null;

  // Add-feedback draft (state, reset-on-open, and validation) lives in a hook;
  // resets whenever a different candidate opens.
  const fb = useFeedbackDraft(openId, (entry) => {
    if (view) actions.addFeedback(view.id, entry);
  });

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const job = view ? state.jobs.find((j) => j.id === view.jobId) : undefined;
  const a = view ? agg(view) : null;

  // Stage position drives which footer actions exist (no dead-end buttons).
  const stageIdx = job && view ? job.stages.indexOf(view.stage) : -1;
  const canMoveBack = stageIdx > 0;
  const canAdvance = stageIdx >= 0 && stageIdx < (job?.stages.length ?? 0) - 1;

  // Moving a candidate's stage returns you to the board so the move is visible.
  function moveAndClose(dir: 1 | -1) {
    if (!view) return;
    actions.advance(view.id, dir);
    onClose();
  }

  return (
    <>
      <div
        className={`scrim${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`drawer${open ? ' open' : ''}`}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer-head">
          <button
            className="drawer-star"
            aria-pressed={view?.starred ?? false}
            title={view?.starred ? 'Unstar candidate' : 'Star candidate'}
            onClick={() =>
              view && actions.setCandidateStarred(view.id, !view.starred)
            }
          >
            {view?.starred ? '★' : '☆'}
          </button>
          <div className="who">
            <h2>{view?.name ?? '—'}</h2>
            <div className="sub">
              {view && job ? `${job.title} · ${view.source}` : ''}
            </div>
          </div>
          <button className="close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <div className="field-row">
            <div className="field">
              <span className="label">Owner</span>
              <select
                value={view?.owner ?? FOUNDERS[0].id}
                onChange={(e) => view && actions.setOwner(view.id, e.target.value)}
              >
                {FOUNDERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="label">Status</span>
              <select
                value={view?.status ?? 'active'}
                onChange={(e) =>
                  view && actions.setStatus(view.id, e.target.value as Status)
                }
              >
                {(Object.keys(STATUS) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <span className="label">Source</span>
              <select
                value={view?.source ?? SOURCES[0]}
                onChange={(e) => view && actions.setSource(view.id, e.target.value)}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="label">Current status</span>
              <div>
                {view && (
                  <span className={`status-pill st-${view.status}`}>
                    {STATUS[view.status]}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="feedback">
            <div className="section-title">
              Interview feedback
              <span className="agg">
                {a == null ? (
                  <span className="rating-chip muted">No ratings</span>
                ) : (
                  <span className={`rating-chip ${RATINGS[Math.round(a) as RatingValue].cls}`}>
                    {RATINGS[Math.round(a) as RatingValue].label} · avg {a.toFixed(1)}
                  </span>
                )}
              </span>
            </div>

            <div>
              {!view || view.feedback.length === 0 ? (
                <div className="fb-empty">
                  No feedback yet — add the first review below.
                </div>
              ) : (
                <div className="feedback">
                  {view.feedback.map((f, i) => {
                    const r = RATINGS[f.rating];
                    const fo = founderById(f.byFounder);
                    return (
                      <div className="fb-entry" key={i}>
                        <div className="fb-top">
                          <span className="avatar">{fo.initials}</span>
                          <span className="fb-who">{fo.name}</span>
                          <span
                            className={`rating-chip ${r.cls}`}
                            style={{ marginLeft: 'auto' }}
                          >
                            {r.label}
                          </span>
                        </div>
                        {f.note && <div className="fb-note">{f.note}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="add-fb">
              <div className="field">
                <span className="label">Interviewer</span>
                <select value={fb.who} onChange={(e) => fb.setWho(e.target.value)}>
                  {FOUNDERS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="label">Rating</span>
                <div className="rating-picker">
                  {RATING_ORDER.map((v) => (
                    <button
                      key={v}
                      className={`rp ${RATINGS[v].cls}`}
                      aria-pressed={fb.rating === v}
                      onClick={() => fb.pickRating(v)}
                    >
                      {RATINGS[v].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="label">Note</span>
                <textarea
                  value={fb.note}
                  maxLength={2000}
                  onChange={(e) => fb.setNote(e.target.value)}
                  placeholder="What stood out? Concerns?"
                />
              </div>
              {fb.error && <div className="form-error">{fb.error}</div>}
              <button className="btn primary" onClick={() => fb.submit()}>
                Add feedback
              </button>
            </div>
          </div>
        </div>

        <div className="drawer-foot">
          <div className="stage-now">
            Stage: <b>{view?.stage ?? '—'}</b>
          </div>
          {canMoveBack && (
            <button className="btn" onClick={() => moveAndClose(-1)}>
              ← Move back
            </button>
          )}
          {canAdvance && (
            <button className="btn primary" onClick={() => moveAndClose(1)}>
              Advance stage →
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
