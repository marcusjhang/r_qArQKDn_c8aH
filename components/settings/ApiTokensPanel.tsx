'use client';

// Manage per-user MCP API tokens from /settings (Decision 2). Mirrors the other
// settings panels' styling and useTransition write flow. Minting returns the
// full secret exactly once — it appears in a reveal-once box with a pre-filled
// `claude mcp add` command and is never shown again; only a name, prefix, last-
// used, and optional expiry are listed afterwards. Revoking deletes the token.

import { useState, useTransition } from 'react';
import type { ApiTokenSummary } from '@/lib/tokens';
import type { CreateTokenResult, SettingsResult } from '@/lib/settings-types';

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
    <section className="settings-panel">
      <div>
        <p className="settings-section-title">MCP</p>
        <h1 className="settings-title">API Tokens</h1>
      </div>

      <form className="settings-add" onSubmit={create}>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <span className="label">Token name</span>
          <input
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
        <div className="field">
          <span className="label">Expiry</span>
          <select
            className="token-expiry-select"
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
        <button className="btn primary" type="submit" disabled={pending}>
          Create token
        </button>
      </form>
      {error && <div className="form-error">{error}</div>}

      {minted && (
        <div className="token-reveal" role="status">
          <div className="token-reveal-head">
            <span>✓ Copy it now. You won&apos;t see it again.</span>
            <button
              type="button"
              className="btn"
              onClick={() => setMinted(null)}
              aria-label="Dismiss token"
            >
              Done
            </button>
          </div>
          <code className="token-cmd">{minted.token}</code>
          <div className="token-reveal-foot">
            <button
              type="button"
              className="btn primary"
              onClick={() => copy(minted.token, 'token')}
            >
              {copiedField === 'token' ? 'Copied ✓' : 'Copy token'}
            </button>
          </div>
          <code className="token-cmd">mcp: {minted.command}</code>
          <div className="token-reveal-foot">
            <button
              type="button"
              className="btn primary"
              onClick={() => copy(minted.command, 'command')}
            >
              {copiedField === 'command' ? 'Copied ✓' : 'Copy command'}
            </button>
          </div>
        </div>
      )}

      <ul className="email-list">
        {tokens.length === 0 && (
          <li className="email-empty">
            No tokens yet. Create one to connect Claude Code.
          </li>
        )}
        {tokens.map((t) => {
          const expiry = expiryLabel(t.expiresAt);
          const expired = expiry === 'expired';
          return (
            <li className="email-row" key={t.id}>
              <span className="token-ident">
                <span className="token-name">{t.name}</span>
                <span className="token-prefix">{t.prefix}…</span>
              </span>
              <span className="token-meta">
                {expiry && (
                  <span className={expired ? 'token-badge expired' : 'token-badge'}>
                    {expiry}
                  </span>
                )}
                <span className="token-used">{usedLabel(t.lastUsedAt)}</span>
                <button
                  className="btn"
                  onClick={() => revoke(t.id)}
                  disabled={pending}
                  aria-label={`Revoke ${t.name}`}
                >
                  Revoke
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
