'use client';

// Manage the seniority bands (the years-of-experience → label mapping) from
// /settings — add, edit (label + threshold), and remove. Mirrors the Sources
// panel's styling and useTransition write flow. Each band starts at `minYears`
// whole years; a candidate's band is the highest threshold their experience
// meets. Server actions return a result object so failures (duplicate
// threshold) surface inline instead of throwing. The add/edit/remove state
// machine and shell come from useEditableList / EditableList.

import EditableList from './EditableList';
import { useEditableList } from './useEditableList';
import { Button } from '@/components/ui/button';
import type { SettingsResult } from '@/lib/settings-types';

const LABEL_CLASS =
  'text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground';
const INPUT_CLASS =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none';
const ROW_EDIT_CLASS =
  'min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none';
const YEARS_EDIT_CLASS =
  'w-[84px] min-w-0 flex-[0_0_84px] rounded-md border border-border bg-surface px-2.5 py-1.5 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none';

type Draft = { label: string; years: string };

export default function SeniorityBandsPanel({
  bands,
  maxYears,
  addBand,
  updateBand,
  removeBand
}: {
  bands: { id: number; label: string; minYears: number }[];
  maxYears: number;
  addBand: (label: string, minYears: number) => Promise<SettingsResult>;
  updateBand: (id: number, label: string, minYears: number) => Promise<SettingsResult>;
  removeBand: (id: number) => Promise<SettingsResult>;
}) {
  function parseYears(raw: string): number | null {
    const n = Number(raw.trim());
    if (raw.trim() === '' || !Number.isInteger(n) || n < 0 || n > maxYears) {
      return null;
    }
    return n;
  }

  const list = useEditableList<Draft, Draft>({
    emptyAdd: { label: '', years: '' },
    validateAdd: ({ label, years }) => {
      const l = label.trim();
      const y = parseYears(years);
      if (!l) return 'Enter a band label.';
      if (y === null) return `Enter a threshold of 0–${maxYears} years.`;
      if (bands.some((b) => b.minYears === y)) {
        return 'A band with that threshold already exists.';
      }
      return null;
    },
    onAdd: ({ label, years }) => addBand(label.trim(), parseYears(years)!),
    validateEdit: ({ label, years }) => {
      if (!label.trim()) return 'Enter a band label.';
      if (parseYears(years) === null) {
        return `Enter a threshold of 0–${maxYears} years.`;
      }
      return null;
    },
    onSave: (id, { label, years }) =>
      updateBand(id, label.trim(), parseYears(years)!),
    onRemove: removeBand
  });

  return (
    <EditableList
      section="Seniority"
      title="Seniority bands"
      description={
        <>
          Maps years of experience to a label; the highest matching threshold
          wins.
        </>
      }
      addFields={
        <>
          <div className="flex flex-col gap-1.5" style={{ flex: '2 1 160px' }}>
            <label className={LABEL_CLASS} htmlFor="bands-label">
              Label
            </label>
            <input
              id="bands-label"
              className={INPUT_CLASS}
              type="text"
              placeholder="e.g. Staff"
              maxLength={40}
              value={list.addDraft.label}
              onChange={(e) => list.setAddDraft({ label: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5" style={{ flex: '0 0 120px' }}>
            <label className={LABEL_CLASS} htmlFor="bands-min">
              From (years)
            </label>
            <input
              id="bands-min"
              className={INPUT_CLASS}
              type="number"
              min={0}
              max={maxYears}
              step={1}
              placeholder="0"
              value={list.addDraft.years}
              onChange={(e) => list.setAddDraft({ years: e.target.value })}
            />
          </div>
        </>
      }
      addLabel="Add band"
      onAddSubmit={list.submitAdd}
      pending={list.pending}
      error={list.error}
      items={bands}
      emptyText="No bands yet. Add one to show seniority labels."
      renderRow={(b) =>
        list.editingId === b.id ? (
          <>
            <input
              className={ROW_EDIT_CLASS}
              type="text"
              aria-label={`Label for ${b.label}`}
              maxLength={40}
              autoFocus
              value={list.editDraft.label}
              onChange={(e) => list.setEditDraft({ label: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') list.saveEdit(b.id);
                if (e.key === 'Escape') list.cancelEdit();
              }}
            />
            <input
              className={YEARS_EDIT_CLASS}
              aria-label={`From (years) for ${b.label}`}
              type="number"
              min={0}
              max={maxYears}
              step={1}
              value={list.editDraft.years}
              onChange={(e) => list.setEditDraft({ years: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') list.saveEdit(b.id);
                if (e.key === 'Escape') list.cancelEdit();
              }}
            />
            <Button
              variant="appPrimary"
              onClick={() => list.saveEdit(b.id)}
              disabled={list.pending}
            >
              Save
            </Button>
            <Button
              variant="app"
              onClick={list.cancelEdit}
              disabled={list.pending}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {b.label}{' '}
              <span className="text-muted-foreground">
                · {b.minYears}+ yrs
              </span>
            </span>
            <Button
              variant="app"
              onClick={() =>
                list.startEdit(b.id, {
                  label: b.label,
                  years: String(b.minYears)
                })
              }
              disabled={list.pending}
              aria-label={`Edit ${b.label}`}
            >
              Edit
            </Button>
            <Button
              variant="app"
              onClick={() => list.remove(b.id)}
              disabled={list.pending}
              aria-label={`Remove ${b.label}`}
            >
              Remove
            </Button>
          </>
        )
      }
    />
  );
}
