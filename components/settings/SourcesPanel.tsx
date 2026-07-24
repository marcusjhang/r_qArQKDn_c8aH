'use client';

// Manage the candidate-source picklist (the `sources` table) from /settings —
// add, rename, remove. Failures (duplicate name, source in use) surface inline.

import EditableList from './EditableList';
import { useEditableList } from './useEditableList';
import { Button } from '@/components/ui/button';
import type { SettingsResult } from '@/lib/settings-types';

const INPUT_CLASS =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none';
const ROW_EDIT_CLASS =
  'min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none';

export default function SourcesPanel({
  sources,
  addSource,
  renameSource,
  removeSource
}: {
  sources: { id: number; name: string }[];
  addSource: (name: string) => Promise<SettingsResult>;
  renameSource: (id: number, name: string) => Promise<SettingsResult>;
  removeSource: (id: number) => Promise<SettingsResult>;
}) {
  const list = useEditableList<{ name: string }, { name: string }>({
    emptyAdd: { name: '' },
    validateAdd: ({ name }) => {
      const v = name.trim();
      if (!v) return 'Enter a source name.';
      if (sources.some((s) => s.name.toLowerCase() === v.toLowerCase())) {
        return 'That source already exists.';
      }
      return null;
    },
    onAdd: ({ name }) => addSource(name.trim()),
    validateEdit: ({ name }) => (name.trim() ? null : 'Enter a source name.'),
    onSave: (id, { name }) => renameSource(id, name.trim()),
    onRemove: removeSource
  });

  return (
    <EditableList
      section="Sources"
      title="Candidate sources"
      description={
        <>Where candidates come from. A source in use can&apos;t be removed.</>
      }
      addFields={
        <div className="flex flex-col gap-1.5" style={{ flex: '1 1 220px' }}>
          <label
            className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground"
            htmlFor="sources-name"
          >
            Add source
          </label>
          <input
            id="sources-name"
            className={INPUT_CLASS}
            type="text"
            placeholder="e.g. AngelList"
            maxLength={40}
            value={list.addDraft.name}
            onChange={(e) => list.setAddDraft({ name: e.target.value })}
          />
        </div>
      }
      addLabel="Add source"
      onAddSubmit={list.submitAdd}
      pending={list.pending}
      error={list.error}
      items={sources}
      emptyText="No sources yet. Add one to tag candidates."
      renderRow={(s) =>
        list.editingId === s.id ? (
          <>
            <input
              className={ROW_EDIT_CLASS}
              type="text"
              aria-label={`Rename ${s.name}`}
              maxLength={40}
              autoFocus
              value={list.editDraft.name}
              onChange={(e) => list.setEditDraft({ name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') list.saveEdit(s.id);
                if (e.key === 'Escape') list.cancelEdit();
              }}
            />
            <Button
              variant="appPrimary"
              onClick={() => list.saveEdit(s.id)}
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
            <span className="min-w-0 flex-1 truncate text-[13px]">{s.name}</span>
            <Button
              variant="app"
              onClick={() => list.startEdit(s.id, { name: s.name })}
              disabled={list.pending}
              aria-label={`Rename ${s.name}`}
            >
              Rename
            </Button>
            <Button
              variant="app"
              onClick={() => list.remove(s.id)}
              disabled={list.pending}
              aria-label={`Remove ${s.name}`}
            >
              Remove
            </Button>
          </>
        )
      }
    />
  );
}
