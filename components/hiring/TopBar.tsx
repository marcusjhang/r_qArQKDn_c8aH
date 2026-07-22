// Shared top navigation for both the board and the settings page: a white nav
// bar (brand left, account dropdown top-right) plus a grey sub-nav strip below
// it that each page fills (job tabs + actions on the board, a back link on
// settings). Keeping this in one component keeps the two pages consistent.

import Brand from './Brand';
import UserMenu from './UserMenu';

export default function TopBar({
  subtitle,
  userEmail,
  nav,
  topRight,
  children
}: {
  subtitle: string;
  userEmail?: string | null;
  nav?: { href: string; label: string };
  // Optional controls rendered in the top nav, left of the account menu
  // (e.g. the notification bell on the board).
  topRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      <header className="topbar">
        <Brand subtitle={subtitle} />
        <div className="spacer" />
        {topRight}
        <UserMenu email={userEmail} nav={nav} />
      </header>
      {children && <div className="subnav">{children}</div>}
    </>
  );
}
