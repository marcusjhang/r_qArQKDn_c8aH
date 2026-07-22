// The drawer's editable candidate fields: owner, status, source and a read-only
// current-status pill. Each change is written straight through to the store.

import {
  FOUNDERS,
  SOURCES,
  STATUS,
  type Candidate,
  type HiringActions,
  type Status
} from '@/lib/hiring';

export default function CandidateFields({
  candidate,
  actions
}: {
  candidate: Candidate | null;
  actions: HiringActions;
}) {
  return (
    <>
      <div className="field-row">
        <div className="field">
          <span className="label">Owner</span>
          <select
            value={candidate?.owner ?? FOUNDERS[0].id}
            onChange={(e) =>
              candidate && actions.setOwner(candidate.id, e.target.value)
            }
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
            value={candidate?.status ?? 'active'}
            onChange={(e) =>
              candidate && actions.setStatus(candidate.id, e.target.value as Status)
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
            value={candidate?.source ?? SOURCES[0]}
            onChange={(e) =>
              candidate && actions.setSource(candidate.id, e.target.value)
            }
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
            {candidate && (
              <span className={`status-pill st-${candidate.status}`}>
                {STATUS[candidate.status]}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
