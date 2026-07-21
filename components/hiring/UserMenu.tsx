'use client';

// Account dropdown in the top bar: shows the signed-in email; opens a menu with
// Settings and a red Sign out.
//
// Sign out uses redirect:false + a relative navigation because next-auth's
// built-in redirect builds an absolute URL from the server's internal host
// (localhost behind the preview proxy), which the browser can't reach.

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';

export default function UserMenu({ email }: { email?: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleSignOut() {
    await signOut({ redirect: false });
    window.location.href = '/login';
  }

  return (
    <div className="usermenu" ref={ref}>
      <button
        className="btn usermenu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="usermenu-email" title={email ?? undefined}>
          {email ?? 'Account'}
        </span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="usermenu-menu" role="menu">
          <button
            className="usermenu-item danger"
            role="menuitem"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
