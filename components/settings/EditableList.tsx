'use client';

// Presentational shell for the settings/members editable-list panels (Sources,
// Seniority bands, Allowlist): the section header, the add form, an inline
// error, and the list of rows. The shared markup (`.settings-panel`,
// `.settings-add`, `.email-list`/`.email-row`) and its accessibility live here;
// each panel supplies only the bits that differ via render props — the add-form
// fields and each row's contents — and drives the state machine with
// `useEditableList`. Item rows key on `item.id`.

import type { ReactNode } from 'react';
import { FormError } from '@/components/ui/form-error';

export interface EditableListItem {
  id: number;
}

export default function EditableList<T extends EditableListItem>({
  section,
  title,
  description,
  addFields,
  addLabel,
  onAddSubmit,
  pending,
  error,
  items,
  emptyText,
  renderRow
}: {
  /** Eyebrow label above the title (`.settings-section-title`). */
  section: string;
  /** Panel heading (`.settings-title`). */
  title: string;
  /** Sub-copy under the heading (`.settings-sub`). */
  description: ReactNode;
  /** The add-form field(s), rendered inside `form.settings-add`. */
  addFields: ReactNode;
  /** Submit-button label for the add form. */
  addLabel: string;
  /** Add-form submit handler. */
  onAddSubmit: (e: React.FormEvent) => void;
  /** Whether a write is in flight (disables the add button). */
  pending: boolean;
  /** Current error message, or '' when clear. */
  error: string;
  /** The rows to render. */
  items: T[];
  /** Copy shown when there are no rows (`.email-empty`). */
  emptyText: ReactNode;
  /** Render one row's contents (either its display or inline-edit view). */
  renderRow: (item: T) => ReactNode;
}) {
  return (
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">{section}</p>
        <h1 className="settings-title">{title}</h1>
        <p className="settings-sub">{description}</p>
      </div>

      <form className="settings-add" onSubmit={onAddSubmit}>
        {addFields}
        <button className="btn primary" type="submit" disabled={pending}>
          {addLabel}
        </button>
      </form>
      <FormError message={error} />

      <ul className="email-list">
        {items.length === 0 && <li className="email-empty">{emptyText}</li>}
        {items.map((item) => (
          <li className="email-row" key={item.id}>
            {renderRow(item)}
          </li>
        ))}
      </ul>
    </section>
  );
}
