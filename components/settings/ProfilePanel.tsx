'use client';

// Edit the signed-in account's first / last name from /settings. Shows a live
// initials preview since avatar initials derive from the name.

import { useState, useTransition } from 'react';
import { initials } from '@/lib/hiring';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import type { SettingsResult } from '@/lib/settings-types';

const INPUT_CLASS =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none';

export default function ProfilePanel({
  firstName: initialFirst,
  lastName: initialLast,
  email,
  updateProfile
}: {
  firstName: string;
  lastName: string;
  email?: string | null;
  updateProfile: (firstName: string, lastName: string) => Promise<SettingsResult>;
}) {
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Same rule as the avatar everywhere else: initials derived from the name.
  const combined = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
  const preview = initials({
    firstName: firstName.trim() || null,
    lastName: lastName.trim() || null,
    email: email ?? ''
  });

  function save(e: React.FormEvent) {
    e.preventDefault();
    const f = firstName.trim();
    const l = lastName.trim();
    if (!f && !l) {
      setError('Enter a first or last name.');
      return;
    }
    startTransition(async () => {
      const res = await updateProfile(f, l);
      if (res.ok) {
        setError('');
        setSaved(true);
      } else {
        setSaved(false);
        setError(res.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
          Profile
        </p>
        <h2 className="mb-1 text-[17px] font-bold">Your name</h2>
        <p className="text-[12.5px] text-muted-foreground">
          Avatar initials come from it, like BO for Ben Ong.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={save}
      >
        <Avatar title={combined || undefined} aria-hidden>
          {preview}
        </Avatar>
        <div className="flex flex-col gap-1.5" style={{ flex: '1 1 160px' }}>
          <label
            className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground"
            htmlFor="profile-first-name"
          >
            First name
          </label>
          <input
            id="profile-first-name"
            className={INPUT_CLASS}
            type="text"
            placeholder="First"
            maxLength={50}
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              setError('');
              setSaved(false);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5" style={{ flex: '1 1 160px' }}>
          <label
            className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground"
            htmlFor="profile-last-name"
          >
            Last name
          </label>
          <input
            id="profile-last-name"
            className={INPUT_CLASS}
            type="text"
            placeholder="Last"
            maxLength={50}
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              setError('');
              setSaved(false);
            }}
          />
        </div>
        <Button variant="appPrimary" type="submit" disabled={pending}>
          Save name
        </Button>
      </form>
      <FormError message={error} />
      {saved && !error && (
        <div className="text-[12.5px] text-muted-foreground">Saved.</div>
      )}
    </section>
  );
}
