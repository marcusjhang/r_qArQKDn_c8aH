'use client';

// Change the signed-in account's password from /settings. Mirrors ProfilePanel's
// useTransition write flow. Unlike the forced first-login /change-password form,
// this is voluntary, so it collects the *current* password and the server action
// verifies it (see lib/password.ts `updatePassword`). No re-auth on success: the
// password isn't part of the session token, so the user simply stays signed in.

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import type { SettingsResult } from '@/lib/settings-types';

const LABEL_CLASS =
  'text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground';
const INPUT_CLASS =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none';

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
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
          Security
        </p>
        <h1 className="mb-1 text-[17px] font-bold">Password</h1>
        <p className="text-[12.5px] text-muted-foreground">
          Change the password you use to sign in. You&apos;ll need your current
          one.
        </p>
      </div>

      <form className="flex max-w-[360px] flex-col gap-3" onSubmit={save}>
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS} htmlFor="current-password">
            Current password
          </label>
          <input
            id="current-password"
            className={INPUT_CLASS}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={edited(setCurrentPassword)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS} htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            className={INPUT_CLASS}
            type="password"
            autoComplete="new-password"
            minLength={minLength}
            value={newPassword}
            onChange={edited(setNewPassword)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS} htmlFor="confirm-password">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            className={INPUT_CLASS}
            type="password"
            autoComplete="new-password"
            minLength={minLength}
            value={confirmPassword}
            onChange={edited(setConfirmPassword)}
            required
          />
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          Must be at least {minLength} characters.
        </p>
        <div>
          <Button variant="appPrimary" type="submit" disabled={pending}>
            {pending ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </form>
      <FormError message={error} />
      {saved && !error && (
        <div className="text-[12.5px] text-muted-foreground">
          Password updated.
        </div>
      )}
    </section>
  );
}
