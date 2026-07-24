'use client';

// Signup allowlist editor on /members. void actions adapted to the hook's Result
// contract: add failures surface inline; remove failures stay silent (revalidation restores).

import EditableList from '@/components/settings/EditableList';
import { Button } from '@/components/ui/button';
import {
  useEditableList,
  type Result
} from '@/components/settings/useEditableList';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const INPUT_CLASS =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none';

export default function AllowlistPanel({
  emails,
  addEmail,
  removeEmail
}: {
  emails: { id: number; email: string }[];
  addEmail: (email: string) => Promise<void>;
  removeEmail: (id: number) => Promise<void>;
}) {
  const list = useEditableList<{ email: string }, never>({
    emptyAdd: { email: '' },
    validateAdd: ({ email }) => {
      const v = email.trim();
      if (!EMAIL_RE.test(v)) return 'Enter a valid email address.';
      if (emails.some((x) => x.email === v.toLowerCase())) {
        return 'That email is already on the allowlist.';
      }
      return null;
    },
    onAdd: async ({ email }): Promise<Result> => {
      try {
        await addEmail(email.trim());
        return { ok: true };
      } catch {
        return { ok: false, error: 'Could not add that email.' };
      }
    },
    onRemove: async (id): Promise<Result> => {
      try {
        await removeEmail(id);
      } catch {
        /* revalidation will restore state on failure */
      }
      return { ok: true };
    }
  });

  return (
    <EditableList
      section="Allowlist"
      title="Signup allowlist"
      description="Only these emails can sign up."
      addFields={
        <div className="flex flex-col gap-1.5" style={{ flex: '1 1 220px' }}>
          <label
            className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground"
            htmlFor="allowlist-email"
          >
            Add email
          </label>
          <input
            id="allowlist-email"
            className={INPUT_CLASS}
            type="text"
            placeholder="name@company.com"
            value={list.addDraft.email}
            onChange={(e) => list.setAddDraft({ email: e.target.value })}
          />
        </div>
      }
      addLabel="Add to allowlist"
      onAddSubmit={list.submitAdd}
      pending={list.pending}
      error={list.error}
      items={emails}
      emptyText="No emails yet. No one can sign up."
      renderRow={(e) => (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px]">{e.email}</span>
          <Button
            variant="app"
            onClick={() => list.remove(e.id)}
            disabled={list.pending}
            aria-label={`Remove ${e.email}`}
          >
            Remove
          </Button>
        </>
      )}
    />
  );
}
