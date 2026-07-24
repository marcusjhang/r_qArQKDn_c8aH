import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

// lib/mcp/auth.ts is the second auth front door into the shared write core: a
// bearer token minted in /settings, stored only as a SHA-256 digest, verified on
// every MCP request. The module-private `authenticateToken`/`hashToken` are
// exercised through the public surface (`mintToken`, `withTokenAuth`), with the
// db boundary mocked (`selectLimit`) and the best-effort `lastUsedAt` bump spied.

const selectLimit = vi.fn<() => Promise<unknown[]>>();
const updateWhere = vi.fn<() => Promise<unknown>>();
const updateSet = vi.fn((_payload: { lastUsedAt: Date }) => ({
  where: updateWhere
}));
const updateFn = vi.fn(() => ({ set: updateSet }));

vi.mock('@/lib/db', () => ({
  apiTokens: {
    id: {},
    tokenHash: {},
    userId: {},
    expiresAt: {},
    lastUsedAt: {},
    prefix: {}
  },
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => selectLimit() })
      })
    }),
    update: () => updateFn()
  }
}));

import { mintToken, actorUserIdFrom, withTokenAuth } from '@/lib/mcp/auth';

beforeEach(() => {
  selectLimit.mockReset();
  updateFn.mockClear();
  updateSet.mockClear();
  updateWhere.mockReset();
  selectLimit.mockResolvedValue([]);
  updateWhere.mockResolvedValue(undefined);
});

// A stub MCP handler that records the `req.auth` it receives and returns 200, so
// "the handler ran" is distinguishable from the wrapper's 401.
function makeHandler() {
  const captured: { auth?: AuthInfo } = {};
  const handler = vi.fn((req: Request & { auth?: AuthInfo }) => {
    captured.auth = req.auth;
    return new Response('handler-ran', { status: 200 });
  });
  return { handler, captured };
}

function bearerRequest(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/mcp', { method: 'POST', headers });
}

describe('mintToken', () => {
  it("stores sha256(plaintext), never the plaintext itself", () => {
    const minted = mintToken();
    const expected = createHash('sha256').update(minted.token).digest('hex');
    expect(minted.tokenHash).toBe(expected);
    // The persisted digest must not be the secret itself.
    expect(minted.tokenHash).not.toBe(minted.token);
  });

  it('returns a plaintext secret with the public hpt_live_ band', () => {
    const { token } = mintToken();
    expect(token.startsWith('hpt_live_')).toBe(true);
  });

  it('carries 48 hex chars of CSPRNG entropy (24 random bytes)', () => {
    const { token } = mintToken();
    const body = token.slice('hpt_live_'.length);
    expect(body).toMatch(/^[0-9a-f]{48}$/);
    expect(token).toHaveLength('hpt_live_'.length + 48);
  });

  it('stores a display prefix that is a leading slice of the token, too short to be the secret', () => {
    const { token, prefix } = mintToken();
    // prefix = TOKEN_PREFIX (9) + 4 chars of the secret.
    expect(prefix).toHaveLength('hpt_live_'.length + 4);
    expect(token.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(token.length);
  });

  it('stores a 64-char sha256 hex digest', () => {
    expect(mintToken().tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mints a distinct secret and digest each call (entropy, no reuse)', () => {
    const a = mintToken();
    const b = mintToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe('authenticateToken (through withTokenAuth)', () => {
  it('resolves a valid unexpired token to its owner and runs the handler', async () => {
    selectLimit.mockResolvedValue([
      { id: 42, userId: 7, tokenHash: 'digest', expiresAt: null }
    ]);
    const { handler, captured } = makeHandler();
    const res = await withTokenAuth(handler)(bearerRequest('hpt_live_secret'));

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    // The resolved owner is threaded to tools as the actor.
    expect(captured.auth).toBeDefined();
    expect(actorUserIdFrom(captured.auth)).toBe(7);
    expect(captured.auth?.clientId).toBe('api_token:42');
    expect(captured.auth?.extra?.tokenId).toBe(42);
  });

  it('accepts a token whose expiry is still in the future', async () => {
    selectLimit.mockResolvedValue([
      { id: 1, userId: 3, expiresAt: new Date(Date.now() + 60_000) }
    ]);
    const { handler, captured } = makeHandler();
    const res = await withTokenAuth(handler)(bearerRequest('hpt_live_secret'));

    expect(res.status).toBe(200);
    expect(actorUserIdFrom(captured.auth)).toBe(3);
  });

  it('bumps lastUsedAt exactly once on a successful verification', async () => {
    selectLimit.mockResolvedValue([{ id: 42, userId: 7, expiresAt: null }]);
    const { handler } = makeHandler();
    await withTokenAuth(handler)(bearerRequest('hpt_live_secret'));

    expect(updateFn).toHaveBeenCalledOnce();
    expect(updateSet).toHaveBeenCalledOnce();
    // The bump payload is a fresh lastUsedAt timestamp.
    expect(updateSet.mock.calls[0][0]).toMatchObject({
      lastUsedAt: expect.any(Date)
    });
  });

  it('rejects an EXPIRED token with a 401 and never runs the handler or bumps', async () => {
    selectLimit.mockResolvedValue([
      { id: 42, userId: 7, expiresAt: new Date(Date.now() - 1_000) }
    ]);
    const { handler } = makeHandler();
    const res = await withTokenAuth(handler)(bearerRequest('hpt_live_secret'));

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    // Expiry short-circuits before the bump — an expired token must not act.
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('treats a token expiring exactly now (expiresAt <= now) as expired', async () => {
    // Freeze the clock so row.expiresAt.getTime() === Date.now() exactly.
    const frozen = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(frozen);
    try {
      selectLimit.mockResolvedValue([
        { id: 9, userId: 4, expiresAt: new Date(frozen) }
      ]);
      const { handler } = makeHandler();
      const res = await withTokenAuth(handler)(bearerRequest('hpt_live_secret'));
      expect(res.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('rejects an unknown / wrong-hash token (no matching row) with a 401', async () => {
    selectLimit.mockResolvedValue([]);
    const { handler } = makeHandler();
    const res = await withTokenAuth(handler)(bearerRequest('hpt_live_bogus'));

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('rejects a request with no bearer token without ever touching the db', async () => {
    const { handler } = makeHandler();
    const res = await withTokenAuth(handler)(bearerRequest(undefined));

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    // Missing bearer short-circuits before any lookup.
    expect(selectLimit).not.toHaveBeenCalled();
  });

  it('still authorizes a valid token when the lastUsedAt bump throws (best-effort, non-fatal)', async () => {
    selectLimit.mockResolvedValue([{ id: 42, userId: 7, expiresAt: null }]);
    updateWhere.mockRejectedValue(new Error('db write failed'));
    const { handler, captured } = makeHandler();
    const res = await withTokenAuth(handler)(bearerRequest('hpt_live_secret'));

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(actorUserIdFrom(captured.auth)).toBe(7);
  });
});

describe('actorUserIdFrom', () => {
  const base = { token: 't', clientId: 'c', scopes: [] } satisfies Omit<
    AuthInfo,
    'extra'
  >;

  it('returns the numeric actor id from extra.userId', () => {
    expect(actorUserIdFrom({ ...base, extra: { userId: 7 } })).toBe(7);
  });

  it('accepts 0 as a valid numeric id (guard is typeof, not truthiness)', () => {
    expect(actorUserIdFrom({ ...base, extra: { userId: 0 } })).toBe(0);
  });

  it('rejects a missing actor id (no extra) as null', () => {
    expect(actorUserIdFrom({ ...base })).toBeNull();
  });

  it('rejects an empty extra as null', () => {
    expect(actorUserIdFrom({ ...base, extra: {} })).toBeNull();
  });

  it('rejects a non-numeric actor id (string) as null', () => {
    expect(actorUserIdFrom({ ...base, extra: { userId: '7' } })).toBeNull();
  });

  it('rejects a null actor id as null', () => {
    expect(actorUserIdFrom({ ...base, extra: { userId: null } })).toBeNull();
  });

  it('rejects an undefined AuthInfo as null', () => {
    expect(actorUserIdFrom(undefined)).toBeNull();
  });
});
