// Shared top navigation for the board and settings pages: a nav bar (brand + account menu) plus a sub-nav strip each page fills.

import Brand from './Brand';
import UserMenu from './UserMenu';

export default function TopBar({
  subtitle,
  userEmail,
  navItems,
  topRight,
  children
}: {
  subtitle: string;
  userEmail?: string | null;
  navItems?: { href: string; label: string }[];
  // Optional controls in the top nav, left of the account menu (e.g. the notification bell).
  topRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface p-4">
        <Brand subtitle={subtitle} />
        <div className="min-w-0 flex-1" />
        {topRight}
        <UserMenu email={userEmail} navItems={navItems} />
      </header>
      {children && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {children}
        </div>
      )}
    </>
  );
}
