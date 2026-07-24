import { describe, it, expect, vi } from 'vitest';
import {
  RateLimiter,
  InMemoryRateLimitStore,
  PostgresRateLimitStore,
  createDefaultStore,
  clientIp,
  type RateLimitExecutor
} from '@/lib/rate-limit';

// A controllable clock so the sliding window can be exercised deterministically.
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

// The in-memory store is the reference implementation of the window algorithm.
function memLimiter(
  opts: { limit: number; windowMs: number },
  now: () => number
) {
  return new RateLimiter(new InMemoryRateLimitStore(), opts, now);
}

describe('RateLimiter (in-memory store)', () => {
  it('allows hits up to the limit, then blocks', async () => {
    const clock = fakeClock();
    const rl = memLimiter({ limit: 3, windowMs: 1000 }, clock.now);
    expect((await rl.check('k')).allowed).toBe(true);
    expect((await rl.check('k')).allowed).toBe(true);
    expect((await rl.check('k')).allowed).toBe(true);
    const blocked = await rl.check('k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('reports decreasing remaining counts', async () => {
    const rl = memLimiter({ limit: 3, windowMs: 1000 }, fakeClock().now);
    expect((await rl.check('k')).remaining).toBe(2);
    expect((await rl.check('k')).remaining).toBe(1);
    expect((await rl.check('k')).remaining).toBe(0);
  });

  it('frees the window once the oldest hit ages out', async () => {
    const clock = fakeClock();
    const rl = memLimiter({ limit: 2, windowMs: 1000 }, clock.now);
    await rl.check('k');
    await rl.check('k');
    expect((await rl.check('k')).allowed).toBe(false);
    clock.advance(1001);
    expect((await rl.check('k')).allowed).toBe(true);
  });

  it('reports retryAfterMs from the oldest hit, not extended by blocked hits', async () => {
    const clock = fakeClock();
    const rl = memLimiter({ limit: 1, windowMs: 1000 }, clock.now);
    await rl.check('k'); // oldest hit at t=0
    clock.advance(400);
    const first = await rl.check('k');
    expect(first.retryAfterMs).toBe(600); // 0 + 1000 - 400
    clock.advance(100);
    // A second blocked hit must not push the window forward: still keyed off t=0.
    expect((await rl.check('k')).retryAfterMs).toBe(500); // 0 + 1000 - 500
  });

  it('tracks keys independently', async () => {
    const rl = memLimiter({ limit: 1, windowMs: 1000 }, fakeClock().now);
    expect((await rl.check('a')).allowed).toBe(true);
    expect((await rl.check('b')).allowed).toBe(true);
    expect((await rl.check('a')).allowed).toBe(false);
  });

  it('reset() clears recorded hits', async () => {
    const rl = memLimiter({ limit: 1, windowMs: 1000 }, fakeClock().now);
    await rl.check('k');
    expect((await rl.check('k')).allowed).toBe(false);
    await rl.reset();
    expect((await rl.check('k')).allowed).toBe(true);
  });
});

describe('RateLimiter fail-open', () => {
  it('allows the request when the store throws', async () => {
    const store = {
      check: vi.fn().mockRejectedValue(new Error('db down'))
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rl = new RateLimiter(store, { limit: 5, windowMs: 1000 });
    const res = await rl.check('k');
    expect(res).toEqual({ allowed: true, remaining: 5, retryAfterMs: 0 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('PostgresRateLimitStore', () => {
  it('delegates to its executor and marshals the row', async () => {
    const exec: RateLimitExecutor = vi.fn(async (key, opts, now) => {
      expect(key).toBe('login:ip:1.2.3.4');
      expect(opts).toEqual({ limit: 10, windowMs: 5000 });
      expect(now).toBe(42);
      return { allowed: false, remaining: 0, retryAfterMs: 1234 };
    });
    const store = new PostgresRateLimitStore(exec);
    const res = await store.check('login:ip:1.2.3.4', { limit: 10, windowMs: 5000 }, 42);
    expect(res).toEqual({ allowed: false, remaining: 0, retryAfterMs: 1234 });
    expect(exec).toHaveBeenCalledOnce();
  });
});

describe('createDefaultStore', () => {
  // The environment is passed as a structured override object, so these cases
  // never read or mutate the global process.env (which would leak across tests).
  it('honors RATE_LIMIT_STORE=memory even when DATABASE_URL is set', () => {
    expect(
      createDefaultStore({
        RATE_LIMIT_STORE: 'memory',
        DATABASE_URL: 'postgres://x'
      })
    ).toBeInstanceOf(InMemoryRateLimitStore);
  });

  it('honors RATE_LIMIT_STORE=postgres', () => {
    expect(
      createDefaultStore({ RATE_LIMIT_STORE: 'postgres' })
    ).toBeInstanceOf(PostgresRateLimitStore);
  });

  it('uses Postgres when DATABASE_URL is set and no override', () => {
    expect(
      createDefaultStore({ DATABASE_URL: 'postgres://x' })
    ).toBeInstanceOf(PostgresRateLimitStore);
  });

  it('falls back to in-memory with no DATABASE_URL and no override', () => {
    expect(createDefaultStore({})).toBeInstanceOf(InMemoryRateLimitStore);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) =>
    new Request('http://x/', { headers });

  it('takes the nearest-proxy (rightmost) hop from x-forwarded-for', () => {
    // The rightmost entry is the address the trusted proxy appended; the
    // leftmost is client-controlled and would let a caller spoof a fresh bucket.
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe(
      '5.6.7.8'
    );
  });

  it('ignores a spoofed leftmost value and trusts the appended one', () => {
    expect(
      clientIp(req({ 'x-forwarded-for': 'evil, 203.0.113.7' }))
    ).toBe('203.0.113.7');
  });

  it('handles a single-value x-forwarded-for', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4' }))).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it("fails safe to a shared 'unknown' bucket when no header is present", () => {
    expect(clientIp(req({}))).toBe('unknown');
  });
});
