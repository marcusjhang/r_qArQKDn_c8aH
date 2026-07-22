'use client';

// Edit the signed-in account's first / last name from /settings. Mirrors the
// allowlist and sources panels' useTransition write flow. The combined name is
// what the rest of the app displays, and avatar initials derive from it (first
// word + last word) — so we show a live initials preview here to make that
// relationship obvious.

import { useState, useTransition } from 'react';
import { initials } from '@/lib/hiring';

type Result = { ok: true } | { ok: false; error: string };

export default function ProfilePanel({
  firstName: initialFirst,
  lastName: initialLast,
  email,
  updateProfile
}: {
  firstName: string;
  lastName: string;
  email?: string | null;
  updateProfile: (firstName: string, lastName: string) => Promise<Result>;
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
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">Profile</p>
        <h1 className="settings-title">Your name</h1>
        <p className="settings-sub">
          Your name. Avatar initials come from it — e.g. Ben Ong → BO.
        </p>
      </div>

      <form className="settings-add" onSubmit={save}>
        <span className="avatar" title={combined || undefined} aria-hidden>
          {preview}
        </span>
        <div className="field" style={{ flex: '1 1 160px' }}>
          <span className="label">First name</span>
          <input
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
        <div className="field" style={{ flex: '1 1 160px' }}>
          <span className="label">Last name</span>
          <input
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
        <button className="btn primary" type="submit" disabled={pending}>
          Save name
        </button>
      </form>
      {error && <div className="form-error">{error}</div>}
      {saved && !error && <div className="settings-sub">Saved.</div>}
    </section>
  );
}
