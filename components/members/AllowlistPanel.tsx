'use client';

// Manage the signup allowlist from /members (moved here from /settings). Only
// emails on this list can register and become a member. Mirrors the settings
// panels' useTransition write flow; revalidation restores state if a write
// fails. Shares the add/remove state machine and shell with the Sources /
// Seniority panels via useEditableList / EditableList — the underlying actions
// return void, so they're adapted to the hook's Result contract here (add
// failures surface inline; remove failures stay silent, as revalidation
// restores state).

import EditableList from '@/components/settings/EditableList';
import {
  useEditableList,
  type Result
} from '@/components/settings/useEditableList';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
      // Failures are intentionally silent; revalidation restores the row.
      return { ok: true };
    }
  });

  return (
    <EditableList
      section="Allowlist"
      title="Signup allowlist"
      description="Only these emails can sign up."
      addFields={
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label className="label" htmlFor="allowlist-email">Add email</label>
          <input
            id="allowlist-email"
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
          <span className="email-addr">{e.email}</span>
          <button
            className="btn"
            onClick={() => list.remove(e.id)}
            disabled={list.pending}
            aria-label={`Remove ${e.email}`}
          >
            Remove
          </button>
        </>
      )}
    />
  );
}
