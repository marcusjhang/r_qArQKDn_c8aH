'use client';

// Members page: the team directory with per-member activity history, plus the
// signup allowlist (moved here from /settings — the allowlist governs who can
// become a member). Styled with the board's design system (.ht-root) so it
// matches the rest of the app, mirroring SettingsView's layout. Server actions
// are passed in from the page (the @/app path isn't aliased).

import Link from 'next/link';
import TopBar from '@/components/hiring/TopBar';
import MembersPanel from './MembersPanel';
import AllowlistPanel from './AllowlistPanel';
import type { Member } from '@/lib/members-types';
import '@/components/hiring/hiring.css';

export default function MembersView({
  members,
  emails,
  userEmail,
  addEmail,
  removeEmail
}: {
  members: Member[];
  emails: { id: number; email: string }[];
  userEmail?: string | null;
  addEmail: (email: string) => Promise<void>;
  removeEmail: (id: number) => Promise<void>;
}) {
  return (
    <div className="ht-root ht-settings">
      <TopBar
        subtitle="Members"
        userEmail={userEmail}
        navItems={[{ href: '/settings', label: '⚙ Settings' }]}
      />

      <div className="settings-wrap">
        <div className="settings-inner">
          <Link className="linkbtn settings-back" href="/">
            ← Dashboard
          </Link>

          <MembersPanel members={members} />

          <AllowlistPanel
            emails={emails}
            addEmail={addEmail}
            removeEmail={removeEmail}
          />
        </div>
      </div>
    </div>
  );
}
