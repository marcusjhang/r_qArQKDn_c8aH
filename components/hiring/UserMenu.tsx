'use client';

// Account dropdown in the top bar: shows the signed-in email; opens a menu with
// context nav items (e.g. Settings + Members on the dashboard) above a red Sign
// out.
//
// Sign out uses redirect:false + a relative navigation because next-auth's
// built-in redirect builds an absolute URL from the server's internal host
// (localhost behind the preview proxy), which the browser can't reach.

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { useDismissableMenu } from './hooks/useDismissableMenu';

/**
 * The account-menu destinations, defined once so each page's top bar composes
 * the links it needs (the board shows both; settings and members link to each
 * other) without repeating the label + route literals.
 */
export const ACCOUNT_LINKS = {
  settings: { href: '/settings', label: 'Settings' },
  members: { href: '/members', label: 'Members' }
} as const;

export default function UserMenu({
  email,
  navItems = []
}: {
  email?: string | null;
  navItems?: { href: string; label: string }[];
}) {
  const menu = useDismissableMenu();

  async function handleSignOut() {
    await signOut({ redirect: false });
    window.location.href = '/login';
  }

  return (
    <div className="usermenu" ref={menu.wrapRef}>
      <Button variant="app" className="usermenu-trigger" {...menu.triggerProps}>
        <span className="usermenu-email" title={email ?? undefined}>
          {email ?? 'Account'}
        </span>
        <span className="caret">▾</span>
      </Button>
      {menu.open && (
        <div className="usermenu-menu" {...menu.menuProps}>
          {navItems.length > 0 && (
            <>
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  className="usermenu-item"
                  role="menuitem"
                  href={item.href}
                  onClick={() => menu.close()}
                >
                  {item.label}
                </Link>
              ))}
              <div className="usermenu-sep" />
            </>
          )}
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
