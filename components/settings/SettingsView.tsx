'use client';

// Settings: manage appearance, your profile, candidate sources, seniority
// bands, stage time-limits, and MCP API tokens. Styled with the app's Tailwind
// design tokens so it matches the rest of the app. Server actions are passed in
// from the page (the @/app path isn't aliased). The signup allowlist lives on
// /members (it governs who can become a member), reachable from the account
// dropdown.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
    <div className="flex h-[100dvh] w-full flex-col bg-background text-[14px] leading-[1.4] text-foreground antialiased">
      <TopBar
        subtitle="Settings"
        userEmail={userEmail}
        navItems={[ACCOUNT_LINKS.members]}
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

          <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
              General
            </p>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[13px] font-semibold">Appearance</div>
                <p className="text-[12.5px] text-muted-foreground">
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
