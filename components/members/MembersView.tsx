'use client';

// Members page: the team directory with per-member activity history, plus the
// signup allowlist (moved here from /settings — the allowlist governs who can
// become a member). Styled with the board's design system (.ht-root) so it
// matches the rest of the app, mirroring SettingsView's layout. Server actions
// are passed in from the page (the @/app path isn't aliased).

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import TopBar from '@/components/hiring/TopBar';
import { ACCOUNT_LINKS } from '@/components/hiring/UserMenu';
import MembersPanel from './MembersPanel';
import AllowlistPanel from './AllowlistPanel';
import type { Member } from '@/lib/members-types';

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
    <div className="flex h-[100dvh] w-full flex-col bg-background text-[14px] leading-[1.4] text-foreground antialiased">
      <TopBar
        subtitle="Members"
        userEmail={userEmail}
        navItems={[ACCOUNT_LINKS.settings]}
      />

      <div className="min-h-0 w-full flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-6">
          <Link
            className="-ml-2 mb-2 inline-flex items-center gap-1.5 self-start rounded-md px-2.5 py-[7px] text-[13px] font-medium text-foreground no-underline hover:bg-surface-2"
            href="/"
          >
            <ArrowLeft size={14} />
            Dashboard
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
