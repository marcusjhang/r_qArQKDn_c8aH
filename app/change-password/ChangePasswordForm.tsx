'use client';

// Forced first-login password change for seeded accounts. Reached only via the
// middleware gate in lib/auth.ts, which confines an account carrying the shared
// default password here until it sets its own. On success we transparently
// re-authenticate with the new password: the session token still carries the
// mustChangePassword flag, so replacing it (a fresh signIn) is what lets the
// gate release us to the board. Styled like the login page for consistency.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ChangePasswordResult } from '@/lib/password';

export default function ChangePasswordForm({
  email,
  minLength,
  changePassword
}: {
  email: string;
  minLength: number;
  changePassword: (
    password: string,
    confirmPassword: string
  ) => Promise<ChangePasswordResult>;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await changePassword(password, confirmPassword);
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }

      // Replace the stale session (still flagged mustChangePassword) by signing
      // in again with the new password. Without this the gate would bounce us
      // right back to this page.
      const signInRes = await signIn('credentials', {
        email,
        password,
        redirect: false
      });
      if (signInRes?.error) {
        // The password was changed but the automatic re-auth failed — send them
        // to sign in manually with the new password.
        router.push('/login');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex justify-center items-start md:items-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Change your password</CardTitle>
          <CardDescription>
            {email
              ? `Set a new password for ${email} before continuing.`
              : 'Set a new password before continuing.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <Input
              type="password"
              aria-label="New password"
              placeholder="New password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              required
              minLength={minLength}
              autoComplete="new-password"
            />
            <Input
              type="password"
              aria-label="Confirm new password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError('');
              }}
              required
              minLength={minLength}
              autoComplete="new-password"
            />
            <p className="text-sm text-muted-foreground">
              Must be at least {minLength} characters.
            </p>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Saving...' : 'Change password'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
