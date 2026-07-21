'use client';

// Signed-in identity + sign-out for the board top bar. Uses next-auth's
// standalone client signOut (no SessionProvider needed) and returns to /login.

import { signOut } from 'next-auth/react';

export default function UserMenu({ email }: { email?: string | null }) {
  return (
    <div className="usermenu">
      {email && (
        <span className="usermenu-email" title={email}>
          {email}
        </span>
      )}
      <button className="btn" onClick={() => signOut({ callbackUrl: '/login' })}>
        Sign out
      </button>
    </div>
  );
}
