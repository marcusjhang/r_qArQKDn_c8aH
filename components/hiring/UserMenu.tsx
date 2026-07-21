'use client';

// Signed-in identity + sign-out for the board top bar.
//
// We sign out with redirect:false and then navigate ourselves to a RELATIVE
// /login. next-auth's built-in redirect would build an ABSOLUTE url from the
// server's internal host (localhost behind the preview proxy), which the
// browser can't reach ("localhost refused to connect"). A relative navigation
// resolves against the current origin, so it works in dev, preview, and prod.

import { signOut } from 'next-auth/react';

export default function UserMenu({ email }: { email?: string | null }) {
  async function handleSignOut() {
    await signOut({ redirect: false });
    window.location.href = '/login';
  }

  return (
    <div className="usermenu">
      {email && (
        <span className="usermenu-email" title={email}>
          {email}
        </span>
      )}
      <button className="btn" onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  );
}
