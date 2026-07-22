'use client';

// Manage the signup allowlist from /members (moved here from /settings). Only
// emails on this list can register and become a member. Mirrors the settings
// panels' useTransition write flow; revalidation restores state if a write
// fails.

import { useState, useTransition } from 'react';

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
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!EMAIL_RE.test(v)) {
      setError('Enter a valid email address.');
      return;
    }
    if (emails.some((x) => x.email === v.toLowerCase())) {
      setError('That email is already on the allowlist.');
      return;
    }
    startTransition(async () => {
      try {
        await addEmail(v);
        setValue('');
        setError('');
      } catch {
        setError('Could not add that email.');
      }
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      try {
        await removeEmail(id);
      } catch {
        /* revalidation will restore state on failure */
      }
    });
  }

  return (
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">Allowlist</p>
        <h1 className="settings-title">Signup allowlist</h1>
        <p className="settings-sub">
          Only these emails can sign up.
        </p>
      </div>

      <form className="settings-add" onSubmit={submit}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <span className="label">Add email</span>
          <input
            type="text"
            placeholder="name@company.com"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
          />
        </div>
        <button className="btn primary" type="submit" disabled={pending}>
          Add to allowlist
        </button>
      </form>
      {error && <div className="form-error">{error}</div>}

      <ul className="email-list">
        {emails.length === 0 && (
          <li className="email-empty">
            No emails yet — no one can sign up.
          </li>
        )}
        {emails.map((e) => (
          <li className="email-row" key={e.id}>
            <span className="email-addr">{e.email}</span>
            <button
              className="btn"
              onClick={() => remove(e.id)}
              disabled={pending}
              aria-label={`Remove ${e.email}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
