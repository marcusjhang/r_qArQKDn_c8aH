'use client';

// Settings: appearance (everyone), plus two admin-gated sections — the signup
// allowlist and member role management (RBAC). Styled with the board's design
// system (.ht-root) so it matches the rest of the app. Server actions are
// passed in from the page (the @/app path isn't aliased).

import { useState, useTransition } from 'react';
import Link from 'next/link';
import TopBar from '@/components/hiring/TopBar';
import { ROLES, type Role } from '@/lib/rbac';
import ThemeToggle from './ThemeToggle';
import '@/components/hiring/hiring.css';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Member = { id: number; name: string | null; email: string; role: Role };

export default function SettingsView({
  emails,
  members = [],
  userEmail,
  viewerIsOwner = false,
  canManageAllowlist = false,
  canManageRoles = false,
  addEmail,
  removeEmail,
  setUserRole
}: {
  emails: { id: number; email: string }[];
  members?: Member[];
  userEmail?: string | null;
  // RBAC: only an owner may grant/change the owner role.
  viewerIsOwner?: boolean;
  // RBAC: only admins/owners see and manage the signup allowlist.
  canManageAllowlist?: boolean;
  // RBAC: only admins/owners see and manage member roles.
  canManageRoles?: boolean;
  addEmail: (email: string) => Promise<void>;
  removeEmail: (id: number) => Promise<void>;
  setUserRole: (id: number, role: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [memberError, setMemberError] = useState('');
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

  function changeRole(id: number, role: string) {
    setMemberError('');
    startTransition(async () => {
      try {
        await setUserRole(id, role);
      } catch {
        setMemberError('Could not update that role.');
      }
    });
  }

  return (
    <div className="ht-root">
      <TopBar subtitle="Settings" userEmail={userEmail}>
        <Link className="linkbtn" href="/">
          ← Dashboard
        </Link>
      </TopBar>

      <div className="settings-wrap">
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

        {canManageRoles && (
          <section className="settings-panel">
            <div>
              <p className="settings-section-title">Members</p>
              <h1 className="settings-title">Roles &amp; access</h1>
              <p className="settings-sub">
                reader (view only) · writer (pipeline work) · admin (manage
                access) · owner (full control). Only an owner can grant the
                owner role.
              </p>
            </div>

            <ul className="email-list">
              {members.length === 0 && (
                <li className="email-empty">No members yet.</li>
              )}
              {members.map((m) => {
                const isSelf = !!userEmail && m.email === userEmail;
                // Owners can only be edited by an owner; you can't change your
                // own role (prevents self-lockout — transfer via another row).
                const locked = isSelf || (m.role === 'owner' && !viewerIsOwner);
                return (
                  <li className="email-row" key={m.id}>
                    <span className="email-addr">
                      {m.name ? `${m.name} · ` : ''}
                      {m.email}
                      {isSelf ? ' (you)' : ''}
                    </span>
                    <select
                      value={m.role}
                      disabled={pending || locked}
                      aria-label={`Role for ${m.email}`}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option
                          key={r}
                          value={r}
                          disabled={r === 'owner' && !viewerIsOwner}
                        >
                          {r}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
            {memberError && <div className="form-error">{memberError}</div>}
          </section>
        )}

        {canManageAllowlist && (
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
        )}
      </div>
    </div>
  );
}
