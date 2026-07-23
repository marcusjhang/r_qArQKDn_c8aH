'use client';

// Settings: manage appearance, your profile, candidate sources, seniority
// bands, stage time-limits, and MCP API tokens. Styled with the board's design system
// (.ht-root) so it matches the rest of the app. Server actions are passed in
// from the page (the @/app path isn't aliased). The signup allowlist lives on
// /members (it governs who can become a member), reachable from the account
// dropdown.

import Link from 'next/link';
import TopBar from '@/components/hiring/TopBar';
import { ACCOUNT_LINKS } from '@/components/hiring/UserMenu';
import ThemeToggle from './ThemeToggle';
import SourcesPanel from './SourcesPanel';
import SeniorityBandsPanel from './SeniorityBandsPanel';
import StageWarnPanel from './StageWarnPanel';
import ProfilePanel from './ProfilePanel';
import SecurityPanel from './SecurityPanel';
import ApiTokensPanel from './ApiTokensPanel';
import type { SettingsResult, CreateTokenResult } from '@/lib/settings-types';
import type { ApiTokenSummary } from '@/lib/tokens';
import '@/components/hiring/hiring.css';

export default function SettingsView({
  sources,
  bands,
  stageWarnDays,
  maxYears,
  maxStageWarnDays,
  profile,
  tokens,
  userEmail,
  passwordMinLength,
  updateProfile,
  updatePassword,
  addSource,
  renameSource,
  removeSource,
  addBand,
  updateBand,
  removeBand,
  updateStageWarnDays,
  createToken,
  revokeToken
}: {
  sources: { id: number; name: string }[];
  bands: { id: number; label: string; minYears: number }[];
  stageWarnDays: number;
  maxYears: number;
  maxStageWarnDays: number;
  profile: { firstName: string; lastName: string };
  tokens: ApiTokenSummary[];
  userEmail?: string | null;
  passwordMinLength: number;
  updateProfile: (
    firstName: string,
    lastName: string
  ) => Promise<SettingsResult>;
  updatePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
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
  updateStageWarnDays: (days: number) => Promise<SettingsResult>;
  createToken: (
    name: string,
    expiresInDays: number
  ) => Promise<CreateTokenResult>;
  revokeToken: (id: number) => Promise<SettingsResult>;
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

          <SecurityPanel
            minLength={passwordMinLength}
            updatePassword={updatePassword}
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

          <StageWarnPanel
            stageWarnDays={stageWarnDays}
            maxDays={maxStageWarnDays}
            updateStageWarnDays={updateStageWarnDays}
          />

          <ApiTokensPanel
            tokens={tokens}
            createToken={createToken}
            revokeToken={revokeToken}
          />
        </div>
      </div>
    </div>
  );
}
