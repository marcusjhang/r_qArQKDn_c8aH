'use client';

// Change the signed-in account's password from /settings. Mirrors ProfilePanel's
// useTransition write flow. Unlike the forced first-login /change-password form,
// this is voluntary, so it collects the *current* password and the server action
// verifies it (see lib/password.ts `updatePassword`). No re-auth on success: the
// password isn't part of the session token, so the user simply stays signed in.

import { useState, useTransition } from 'react';
import { FormError } from '@/components/ui/form-error';
import type { SettingsResult } from '@/lib/settings-types';

export default function SecurityPanel({
  minLength,
  updatePassword
}: {
  minLength: number;
  updatePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => Promise<SettingsResult>;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Any edit clears the transient result banners so stale success/error text
  // never lingers over a fresh attempt.
  function edited(set: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      set(e.target.value);
      setError('');
      setSaved(false);
    };
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    // Mirror the server's cheap checks for instant feedback; the action re-runs
    // them (and verifies the current password) as the source of truth.
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < minLength) {
      setError(`Password must be at least ${minLength} characters.`);
      return;
    }
    startTransition(async () => {
      const res = await updatePassword(
        currentPassword,
        newPassword,
        confirmPassword
      );
      if (res.ok) {
        setError('');
        setSaved(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setSaved(false);
        setError(res.error);
      }
    });
  }

  return (
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">Security</p>
        <h1 className="settings-title">Password</h1>
        <p className="settings-sub">
          Change the password you use to sign in. You&apos;ll need your current
          one.
        </p>
      </div>

      <form className="settings-form" onSubmit={save}>
        <div className="field">
          <label className="label" htmlFor="current-password">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={edited(setCurrentPassword)}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={minLength}
            value={newPassword}
            onChange={edited(setNewPassword)}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="confirm-password">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={minLength}
            value={confirmPassword}
            onChange={edited(setConfirmPassword)}
            required
          />
        </div>
        <p className="settings-sub">Must be at least {minLength} characters.</p>
        <div>
          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
      <FormError message={error} />
      {saved && !error && <div className="settings-sub">Password updated.</div>}
    </section>
  );
}
