'use client';

// Account dropdown in the top bar. Sign out uses redirect:false + relative navigation because next-auth's built-in redirect builds an absolute URL the browser can't reach behind the preview proxy.

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { useDismissableMenu } from './hooks/useDismissableMenu';

// The account-menu row shared by the nav links and the Sign out action.
const USERMENU_ITEM =
  'block rounded-sm px-2.5 py-2 text-left text-[13px] no-underline hover:bg-surface-2';

/** The account-menu destinations, defined once so each page's top bar composes the links it needs. */
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
    <div className="relative flex items-center gap-2" ref={menu.wrapRef}>
      <Button
        variant="app"
        className="max-w-[220px]"
        {...menu.triggerProps}
      >
        <span
          className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-muted-foreground"
          title={email ?? undefined}
        >
          {email ?? 'Account'}
        </span>
        <ChevronDown
          size={12}
          className="text-muted-foreground"
          aria-hidden
        />
      </Button>
      {menu.open && (
        <div
          className="absolute right-0 top-full z-[25] mt-1.5 flex min-w-[180px] flex-col rounded-md border border-border bg-surface p-1 shadow-ds"
          {...menu.menuProps}
        >
          {navItems.length > 0 && (
            <>
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  className={`${USERMENU_ITEM} text-foreground`}
                  role="menuitem"
                  href={item.href}
                  onClick={() => menu.close()}
                >
                  {item.label}
                </Link>
              ))}
              <div className="mx-0.5 my-1 h-px bg-border" />
            </>
          )}
          <button
            className={`${USERMENU_ITEM} text-sno`}
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
