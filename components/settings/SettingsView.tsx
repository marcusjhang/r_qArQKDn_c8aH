'use client';

// Settings: manage the signup allowlist and candidate sources. Styled with the
// board's design system (.ht-root) so it matches the rest of the app. Server
// actions are passed in from the page (the @/app path isn't aliased).

import { useState, useTransition } from 'react';
import Link from 'next/link';
import TopBar from '@/components/hiring/TopBar';
import ThemeToggle from './ThemeToggle';
import SourcesPanel from './SourcesPanel';
import SeniorityBandsPanel from './SeniorityBandsPanel';
import ProfilePanel from './ProfilePanel';
import '@/components/hiring/hiring.css';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type SettingsResult = { ok: true } | { ok: false; error: string };

export default function SettingsView({
  emails,
  sources,
  bands,
  maxYears,
  profile,
  userEmail,
  updateProfile,
  addEmail,
  removeEmail,
  addSource,
  renameSource,
  removeSource,
  addBand,
  updateBand,
  removeBand
}: {
  emails: { id: number; email: string }[];
  sources: { id: number; name: string }[];
  bands: { id: number; label: string; minYears: number }[];
  maxYears: number;
  profile: { firstName: string; lastName: string };
  userEmail?: string | null;
  updateProfile: (
    firstName: string,
    lastName: string
  ) => Promise<SettingsResult>;
  addEmail: (email: string) => Promise<void>;
  removeEmail: (id: number) => Promise<void>;
  addSource: (name: string) => Promise<SettingsResult>;
  renameSource: (id: number, name: string) => Promise<SettingsResult>;
  removeSource: (id: number) => Promise<SettingsResult>;
  addBand: (label: string, minYears: number) => Promise<SettingsResult>;
  updateBand: (
    id: number,
    label: string,
    minYears: number
  ) => Promise<SettingsResult>;
  removeBand: (id: number) => Promise<SettingsResult>;
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
    <div className="ht-root ht-settings">
      <TopBar subtitle="Settings" userEmail={userEmail}>
        <Link className="linkbtn" href="/">
          ← Dashboard
        </Link>
      </TopBar>

      <div className="settings-wrap">
        <div className="settings-inner">
          <section className="settings-panel">
            <p className="settings-section-title">General</p>
            <div className="setting-row">
              <div>
                <div className="label-strong">Appearance</div>
                <p className="settings-sub">
                  Light, dark, or match your system — for this browser.
                </p>
              </div>
              <ThemeToggle />
            </div>
          </section>

          <ProfilePanel
            firstName={profile.firstName}
            lastName={profile.lastName}
            email={userEmail}
            updateProfile={updateProfile}
          />

          <section className="settings-panel">
            <div>
              <p className="settings-section-title">Allowlist</p>
              <h1 className="settings-title">Signup allowlist</h1>
              <p className="settings-sub">
                Only these email addresses can create an account. Everyone else
                is rejected at sign-up.
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
                  No emails yet — no one can sign up until you add one.
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

          <SourcesPanel
            sources={sources}
            addSource={addSource}
            renameSource={renameSource}
            removeSource={removeSource}
          />

          <SeniorityBandsPanel
            bands={bands}
            maxYears={maxYears}
            addBand={addBand}
            updateBand={updateBand}
            removeBand={removeBand}
          />
        </div>
      </div>
    </div>
  );
}
