'use client';

// Manage the stage time-limits (the "warn after N days in a stage" mapping)
// from /settings: add, edit (stage + days), and remove. Mirrors the Seniority
// bands panel; the add/edit/remove state machine and shell come from
// useEditableList / EditableList. Limits are opt-in per stage: a stage only
// warns on the board once it has a limit here. Server actions return a result
// object so failures (duplicate stage) surface inline instead of throwing.

import EditableList from './EditableList';
import { useEditableList } from './useEditableList';
import { MAX_STAGE_NAME } from '@/lib/hiring/helpers/stages';
import type { SettingsResult } from '@/lib/settings-types';

type Draft = { stage: string; days: string };

export default function StageTimeLimitsPanel({
  stageSlas,
  maxDays,
  addStageSla,
  updateStageSla,
  removeStageSla
}: {
  stageSlas: { id: number; stage: string; maxDays: number }[];
  maxDays: number;
  addStageSla: (stage: string, maxDays: number) => Promise<SettingsResult>;
  updateStageSla: (
    id: number,
    stage: string,
    maxDays: number
  ) => Promise<SettingsResult>;
  removeStageSla: (id: number) => Promise<SettingsResult>;
}) {
  function parseDays(raw: string): number | null {
    const n = Number(raw.trim());
    if (raw.trim() === '' || !Number.isInteger(n) || n < 1 || n > maxDays) {
      return null;
    }
    return n;
  }

  const list = useEditableList<Draft, Draft>({
    emptyAdd: { stage: '', days: '' },
    validateAdd: ({ stage, days }) => {
      const s = stage.trim();
      const d = parseDays(days);
      if (!s) return 'Enter a stage name.';
      if (d === null) return `Enter a limit of 1 to ${maxDays} days.`;
      if (stageSlas.some((x) => x.stage.toLowerCase() === s.toLowerCase())) {
        return 'That stage already has a time limit.';
      }
      return null;
    },
    onAdd: ({ stage, days }) => addStageSla(stage.trim(), parseDays(days)!),
    validateEdit: ({ stage, days }) => {
      if (!stage.trim()) return 'Enter a stage name.';
      if (parseDays(days) === null) {
        return `Enter a limit of 1 to ${maxDays} days.`;
      }
      return null;
    },
    onSave: (id, { stage, days }) =>
      updateStageSla(id, stage.trim(), parseDays(days)!),
    onRemove: removeStageSla
  });

  return (
    <EditableList
      section="Pipeline"
      title="Stage time limits"
      description={
        <>
          Warn on the board when an applicant has sat in a stage too long. Limits
          are per stage name and apply across every job. A stage only warns once
          you set a limit for it.
        </>
      }
      addFields={
        <>
          <div className="field" style={{ flex: '2 1 160px' }}>
            <label className="label" htmlFor="sla-stage">
              Stage
            </label>
            <input
              id="sla-stage"
              type="text"
              placeholder="e.g. Interview"
              maxLength={MAX_STAGE_NAME}
              value={list.addDraft.stage}
              onChange={(e) => list.setAddDraft({ stage: e.target.value })}
            />
          </div>
          <div className="field" style={{ flex: '0 0 140px' }}>
            <label className="label" htmlFor="sla-days">
              Warn after (days)
            </label>
            <input
              id="sla-days"
              type="number"
              min={1}
              max={maxDays}
              step={1}
              placeholder="7"
              value={list.addDraft.days}
              onChange={(e) => list.setAddDraft({ days: e.target.value })}
            />
          </div>
        </>
      }
      addLabel="Add limit"
      onAddSubmit={list.submitAdd}
      pending={list.pending}
      error={list.error}
      items={stageSlas}
      emptyText="No limits yet. Add one to warn when applicants stall in a stage."
      renderRow={(s) =>
        list.editingId === s.id ? (
          <>
            <input
              className="source-edit"
              type="text"
              aria-label={`Stage for ${s.stage} limit`}
              maxLength={MAX_STAGE_NAME}
              autoFocus
              value={list.editDraft.stage}
              onChange={(e) => list.setEditDraft({ stage: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') list.saveEdit(s.id);
                if (e.key === 'Escape') list.cancelEdit();
              }}
            />
            <input
              className="band-years-edit"
              aria-label={`Warn after (days) for ${s.stage} limit`}
              type="number"
              min={1}
              max={maxDays}
              step={1}
              value={list.editDraft.days}
              onChange={(e) => list.setEditDraft({ days: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') list.saveEdit(s.id);
                if (e.key === 'Escape') list.cancelEdit();
              }}
            />
            <button
              className="btn primary"
              onClick={() => list.saveEdit(s.id)}
              disabled={list.pending}
            >
              Save
            </button>
            <button
              className="btn"
              onClick={list.cancelEdit}
              disabled={list.pending}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="email-addr">
              {s.stage}{' '}
              <span className="band-threshold">
                · warn after {s.maxDays} day{s.maxDays === 1 ? '' : 's'}
              </span>
            </span>
            <button
              className="btn"
              onClick={() =>
                list.startEdit(s.id, {
                  stage: s.stage,
                  days: String(s.maxDays)
                })
              }
              disabled={list.pending}
              aria-label={`Edit ${s.stage} limit`}
            >
              Edit
            </button>
            <button
              className="btn"
              onClick={() => list.remove(s.id)}
              disabled={list.pending}
              aria-label={`Remove ${s.stage} limit`}
            >
              Remove
            </button>
          </>
        )
      }
    />
  );
}
