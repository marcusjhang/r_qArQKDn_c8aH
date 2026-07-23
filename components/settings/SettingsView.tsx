'use client';

// Settings: manage appearance, your profile, candidate sources, and seniority
// bands. Styled with the board's design system (.ht-root) so it matches the rest
// of the app. Server actions are passed in from the page (the @/app path isn't
// aliased). The signup allowlist lives on /members (it governs who can become a
// member), reachable from the account dropdown.

import Link from 'next/link';
import TopBar from '@/components/hiring/TopBar';
import { ACCOUNT_LINKS } from '@/components/hiring/UserMenu';
import ThemeToggle from './ThemeToggle';
import SourcesPanel from './SourcesPanel';
import SeniorityBandsPanel from './SeniorityBandsPanel';
import ProfilePanel from './ProfilePanel';
import type { SettingsResult } from '@/lib/settings-types';
import '@/components/hiring/hiring.css';

export default function SettingsView({
  sources,
  bands,
  maxYears,
  profile,
  userEmail,
  updateProfile,
  addSource,
  renameSource,
  removeSource,
  addBand,
  updateBand,
  removeBand
}: {
  sources: { id: number; name: string }[];
  bands: { id: number; label: string; minYears: number }[];
  maxYears: number;
  profile: { firstName: string; lastName: string };
  userEmail?: string | null;
  updateProfile: (
    firstName: string,
    lastName: string
  ) => Promise<SettingsResult>;
  addSource: (name: string) => Promise<SettingsResult>;
  renameSource: (id: number, name: string) => Promise<SettingsResult>;
  removeSource: (id: number) => Promise<SettingsResult>;
  addBand: (label: string, minYears: number) => Promise<SettingsResult>;
  updateBand: (
    id: number,
    label: string,
    minYears: number
  ) => Promise<SettingsResult>;
  removeBand: (id: number) => Promise<SettingsResult>;
}) {
  return (
    <div className="ht-root ht-settings">
      <TopBar
        subtitle="Settings"
        userEmail={userEmail}
        navItems={[ACCOUNT_LINKS.members]}
      />

      <div className="settings-wrap">
        <div className="settings-inner">
          <Link className="linkbtn settings-back" href="/">
            ← Dashboard
          </Link>

          <section className="settings-panel">
            <p className="settings-section-title">General</p>
            <div className="setting-row">
              <div>
                <div className="label-strong">Appearance</div>
                <p className="settings-sub">
                  Light, dark, or match your system. Saved for this browser.
                </p>
              </div>
              <ThemeToggle />
            </div>
          </section>

          <ProfilePanel
            firstName={profile.firstName}
            lastName={profile.lastName}
            email={userEmail}
            updateProfile={updateProfile}
          />

          <SourcesPanel
            sources={sources}
            addSource={addSource}
            renameSource={renameSource}
            removeSource={removeSource}
          />

          <SeniorityBandsPanel
            bands={bands}
            maxYears={maxYears}
            addBand={addBand}
            updateBand={updateBand}
            removeBand={removeBand}
          />
        </div>
      </div>
    </div>
  );
}
