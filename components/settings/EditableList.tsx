'use client';

// Presentational shell for the settings/members editable-list panels (Sources,
// Seniority bands, Allowlist): the section header, the add form, an inline
// error, and the list of rows. The shared markup and its accessibility live
// here; each panel supplies only the bits that differ via render props — the
// add-form fields and each row's contents — and drives the state machine with
// `useEditableList`. Item rows key on `item.id`.

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
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
  /** Eyebrow label above the title. */
  section: string;
  /** Panel heading. */
  title: string;
  /** Sub-copy under the heading. */
  description: ReactNode;
  /** The add-form field(s), rendered inside the add form. */
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
  /** Copy shown when there are no rows. */
  emptyText: ReactNode;
  /** Render one row's contents (either its display or inline-edit view). */
  renderRow: (item: T) => ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
          {section}
        </p>
        <h2 className="mb-1 text-[17px] font-bold">{title}</h2>
        <p className="text-[12.5px] text-muted-foreground">{description}</p>
      </div>

      <form className="flex flex-wrap items-end gap-3" onSubmit={onAddSubmit}>
        {addFields}
        <Button variant="appPrimary" type="submit" disabled={pending}>
          {addLabel}
        </Button>
      </form>
      <FormError message={error} />

      <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="editable-list">
        {items.length === 0 && (
          <li className="text-[12.5px] italic text-muted-foreground">
            {emptyText}
          </li>
        )}
        {items.map((item) => (
          <li
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2"
            key={item.id}
          >
            {renderRow(item)}
          </li>
        ))}
      </ul>
    </section>
  );
}
