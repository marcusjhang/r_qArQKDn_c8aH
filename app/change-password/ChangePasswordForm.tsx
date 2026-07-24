'use client';

// Forced first-login password change for seeded accounts; on success re-authenticates so the fresh session drops the mustChangePassword flag and the gate releases.

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

      // Re-sign-in to replace the stale mustChangePassword session; without this the gate bounces us back here.
      const signInRes = await signIn('credentials', {
        email,
        password,
        redirect: false
      });
      if (signInRes?.error) {
        // Password changed but auto re-auth failed — sign in manually.
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
