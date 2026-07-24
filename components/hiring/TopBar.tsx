// Shared top navigation for both the board and the settings page: a white nav
// bar (brand left, account dropdown top-right) plus a grey sub-nav strip below
// it that each page fills (job tabs + actions on the board, a back link on
// settings). Keeping this in one component keeps the two pages consistent.

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
  // Optional controls rendered in the top nav, left of the account menu
  // (e.g. the notification bell on the board).
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
