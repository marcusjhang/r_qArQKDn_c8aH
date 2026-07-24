'use client';

// Manage per-user MCP API tokens from /settings (Decision 2). Mirrors the other
// settings panels' styling and useTransition write flow. Minting returns the
// full secret exactly once — it appears in a reveal-once box with a pre-filled
// `claude mcp add` command and is never shown again; only a name, prefix, last-
// used, and optional expiry are listed afterwards. Revoking deletes the token.

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import type { ApiTokenSummary } from '@/lib/tokens';
import type { CreateTokenResult, SettingsResult } from '@/lib/settings-types';

const LABEL_CLASS =
  'text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground';
const INPUT_CLASS =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none';
const TOKEN_CMD_CLASS =
  'block break-all rounded-md border border-syes bg-surface p-[9px] font-mono text-[12px] leading-[1.5] text-foreground';

const EXPIRY_OPTIONS: { label: string; days: number }[] = [
  { label: 'No expiry', days: 0 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 }
];

/** "2m ago" / "3d ago"-style relative label for a past ISO timestamp. */
function usedLabel(iso: string | null): string {
  if (!iso) return 'never used';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'used just now';
  if (mins < 60) return `used ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `used ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `used ${days}d ago`;
}

/** Expiry badge text, or null when the token never expires. */
function expiryLabel(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  return `expires in ${days}d`;
}

export default function ApiTokensPanel({
  tokens,
  createToken,
  revokeToken
}: {
  tokens: ApiTokenSummary[];
  createToken: (
    name: string,
    expiresInDays: number
  ) => Promise<CreateTokenResult>;
  revokeToken: (id: number) => Promise<SettingsResult>;
}) {
  const [name, setName] = useState('');
  const [expiryDays, setExpiryDays] = useState(0);
  const [error, setError] = useState('');
  // The just-minted secret + connect command, shown once until dismissed /
  // re-minted. The plaintext token is only ever held here in memory.
  const [minted, setMinted] = useState<{
    token: string;
    command: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<'token' | 'command' | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  function create(e: React.FormEvent) {
    e.preventDefault();
    const v = name.trim();
    if (!v) {
      setError('Enter a token name.');
      return;
    }
    startTransition(async () => {
      const res = await createToken(v, expiryDays);
      if (res.ok) {
        setMinted({ token: res.token, command: res.command });
        setCopiedField(null);
        setName('');
        setError('');
      } else {
        setError(res.error);
      }
    });
  }

  function revoke(id: number) {
    startTransition(async () => {
      const res = await revokeToken(id);
      setError(res.ok ? '' : res.error);
    });
  }

  async function copy(text: string, field: 'token' | 'command') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
    } catch {
      /* clipboard unavailable — the text stays visible to copy manually */
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
          MCP
        </p>
        <h1 className="mb-1 text-[17px] font-bold">API Tokens</h1>
      </div>

      <form className="flex flex-wrap items-end gap-3" onSubmit={create}>
        <div className="flex flex-col gap-1.5" style={{ flex: '1 1 200px' }}>
          <span className={LABEL_CLASS}>Token name</span>
          <input
            className={INPUT_CLASS}
            type="text"
            placeholder="e.g. my-laptop"
            maxLength={40}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={LABEL_CLASS}>Expiry</span>
          <select
            className="w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-weak)] focus:outline-none"
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button variant="appPrimary" type="submit" disabled={pending}>
          Create token
        </Button>
      </form>
      <FormError message={error} />

      {minted && (
        <div
          className="flex flex-col gap-2 rounded-md border border-syes bg-syes-bg p-3"
          role="status"
        >
          <div className="flex items-center justify-between gap-3 text-[12.5px] font-bold text-syes">
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} /> Copy it now. You won&apos;t see it again.
            </span>
            <Button
              type="button"
              variant="app"
              onClick={() => setMinted(null)}
              aria-label="Dismiss token"
            >
              Done
            </Button>
          </div>
          <code className={TOKEN_CMD_CLASS}>{minted.token}</code>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="appPrimary"
              onClick={() => copy(minted.token, 'token')}
            >
              {copiedField === 'token' ? (
                <>
                  Copied<Check size={14} />
                </>
              ) : (
                'Copy token'
              )}
            </Button>
          </div>
          <code className={TOKEN_CMD_CLASS}>mcp: {minted.command}</code>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="appPrimary"
              onClick={() => copy(minted.command, 'command')}
            >
              {copiedField === 'command' ? (
                <>
                  Copied<Check size={14} />
                </>
              ) : (
                'Copy command'
              )}
            </Button>
          </div>
        </div>
      )}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {tokens.length === 0 && (
          <li className="text-[12.5px] italic text-muted-foreground">
            No tokens yet.
          </li>
        )}
        {tokens.map((t) => {
          const expiry = expiryLabel(t.expiresAt);
          const expired = expiry === 'expired';
          return (
            <li
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2"
              key={t.id}
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
                <span className="whitespace-nowrap text-[13px] font-semibold">
                  {t.name}
                </span>
                <span className="font-mono text-[12px] text-muted-foreground">
                  {t.prefix}…
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                {expiry && (
                  <span
                    className={
                      expired
                        ? 'rounded-full bg-rej-bg px-2 py-px text-[11px] font-semibold text-rej'
                        : 'rounded-full bg-no-bg px-2 py-px text-[11px] font-semibold text-no'
                    }
                  >
                    {expiry}
                  </span>
                )}
                <span>{usedLabel(t.lastUsedAt)}</span>
                <Button
                  variant="app"
                  onClick={() => revoke(t.id)}
                  disabled={pending}
                  aria-label={`Revoke ${t.name}`}
                >
                  Revoke
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
