import { describe, it, expect } from 'vitest';
import { RateLimiter, clientIp } from '@/lib/rate-limit';

// A controllable clock so the sliding window can be exercised deterministically.
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('RateLimiter', () => {
  it('allows hits up to the limit, then blocks', () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ limit: 3, windowMs: 1000 }, clock.now);
    expect(rl.check('k').allowed).toBe(true);
    expect(rl.check('k').allowed).toBe(true);
    expect(rl.check('k').allowed).toBe(true);
    const blocked = rl.check('k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('reports decreasing remaining counts', () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 1000 }, fakeClock().now);
    expect(rl.check('k').remaining).toBe(2);
    expect(rl.check('k').remaining).toBe(1);
    expect(rl.check('k').remaining).toBe(0);
  });

  it('frees the window once the oldest hit ages out', () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ limit: 2, windowMs: 1000 }, clock.now);
    rl.check('k');
    rl.check('k');
    expect(rl.check('k').allowed).toBe(false);
    clock.advance(1001);
    expect(rl.check('k').allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 }, fakeClock().now);
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('b').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(false);
  });

  it('reset() clears recorded hits', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 }, fakeClock().now);
    rl.check('k');
    expect(rl.check('k').allowed).toBe(false);
    rl.reset();
    expect(rl.check('k').allowed).toBe(true);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) =>
    new Request('http://x/', { headers });

  it('takes the first hop from x-forwarded-for', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe(
      '1.2.3.4'
    );
  });

  it('falls back to x-real-ip', () => {
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it("fails safe to a shared 'unknown' bucket when no header is present", () => {
    expect(clientIp(req({}))).toBe('unknown');
  });
});
