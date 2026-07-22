'use client';

// Auth-form orchestration for the login page: holds the form fields and the
// sign-in/sign-up mode, and owns the submit flow (optionally register via
// /api/register, then sign in with credentials, then redirect). Extracted from
// the page so the component stays presentational.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

export interface LoginForm {
  isSignUp: boolean;
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string;
  loading: boolean;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  /** Flip between sign-in and sign-up, clearing any error. */
  toggleMode: () => void;
}

export function useLoginForm(): LoginForm {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Registration failed');
          setLoading(false);
          return;
        }
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false
      });

      if (result?.error) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  function toggleMode() {
    setIsSignUp((v) => !v);
    setError('');
  }

  return {
    isSignUp,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    error,
    loading,
    handleSubmit,
    toggleMode
  };
}
