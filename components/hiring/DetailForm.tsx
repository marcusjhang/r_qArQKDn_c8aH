'use client';

// Drawer field controls: owner / status / source selects plus the current
// status pill. Each change dispatches straight to the store.

import {
  FOUNDERS,
  SOURCES,
  STATUS,
  type HiringActions,
  type Candidate,
  type Status
} from '@/lib/hiring';

export default function DetailForm({
  view,
  actions
}: {
  view: Candidate | null;
  actions: HiringActions;
}) {
  return (
    <>
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
    </>
  );
}
