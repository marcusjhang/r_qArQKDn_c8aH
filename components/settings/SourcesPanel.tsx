'use client';

// Manage the candidate-source picklist (the `sources` table) from /settings —
// add, rename, and remove. Mirrors the allowlist panel's styling and its
// useTransition write flow. Server actions return a result object so failures
// (duplicate name, source in use) surface inline instead of throwing. The
// add/edit/remove state machine and shell come from useEditableList /
// EditableList.

import EditableList from './EditableList';
import { useEditableList } from './useEditableList';
import type { SettingsResult } from '@/lib/settings-types';

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
        <div className="field" style={{ flex: '1 1 220px' }}>
          <span className="label">Add source</span>
          <input
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
              className="source-edit"
              type="text"
              maxLength={40}
              autoFocus
              value={list.editDraft.name}
              onChange={(e) => list.setEditDraft({ name: e.target.value })}
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
            <span className="email-addr">{s.name}</span>
            <button
              className="btn"
              onClick={() => list.startEdit(s.id, { name: s.name })}
              disabled={list.pending}
              aria-label={`Rename ${s.name}`}
            >
              Rename
            </button>
            <button
              className="btn"
              onClick={() => list.remove(s.id)}
              disabled={list.pending}
              aria-label={`Remove ${s.name}`}
            >
              Remove
            </button>
          </>
        )
      }
    />
  );
}
