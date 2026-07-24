import 'server-only';

// Request throttling for the unauthenticated auth endpoints (login + register).
// A sliding-window log behind a pluggable store: InMemoryRateLimitStore (per
// process) or PostgresRateLimitStore (shared/global via a row-locked SQL function),
// chosen by `createDefaultStore()`. The clock is injectable for deterministic tests.

export interface RateLimitOptions {
  /** Max allowed hits within the window. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether this hit is under the limit. */
  allowed: boolean;
  /** Hits remaining in the current window (0 when blocked). */
  remaining: number;
  /** Milliseconds until the caller may retry (0 when allowed). */
  retryAfterMs: number;
}

/** A backing store for the sliding-window counter, owning the prune/decide/append step. */
export interface RateLimitStore {
  /** Record a hit for `key` at `now` (epoch ms) and report the outcome. */
  check(
    key: string,
    opts: RateLimitOptions,
    now: number
  ): Promise<RateLimitResult>;
  /** Clear all recorded hits (test/maintenance helper). */
  reset?(): void | Promise<void>;
}

/** Pure sliding-window decision over an existing (already-pruned-or-not) log. */
function decide(
  hits: number[],
  opts: RateLimitOptions,
  now: number
): { result: RateLimitResult; nextHits: number[] } {
  const cutoff = now - opts.windowMs;
  const recent = hits.filter((ts) => ts > cutoff);

  if (recent.length >= opts.limit) {
    // Blocked: do NOT record this hit, so hammering can't keep pushing the window forward.
    return {
      result: {
        allowed: false,
        remaining: 0,
        retryAfterMs: recent[0]! + opts.windowMs - now
      },
      nextHits: recent
    };
  }

  recent.push(now);
  return {
    result: {
      allowed: true,
      remaining: opts.limit - recent.length,
      retryAfterMs: 0
    },
    nextHits: recent
  };
}

/** Per-process, in-memory sliding-window store (a module-level Map). */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  async check(
    key: string,
    opts: RateLimitOptions,
    now: number
  ): Promise<RateLimitResult> {
    const { result, nextHits } = decide(this.hits.get(key) ?? [], opts, now);
    this.hits.set(key, nextHits);
    return result;
  }

  reset(): void {
    this.hits.clear();
  }
}

/**
 * The SQL side of the Postgres store, behind a function so it can be faked in
 * tests. `db` is imported lazily so importing this module never constructs the
 * Drizzle client — the in-memory path stays usable without a database.
 */
export type RateLimitExecutor = (
  key: string,
  opts: RateLimitOptions,
  now: number
) => Promise<RateLimitResult>;

const drizzleExecutor: RateLimitExecutor = async (key, opts, now) => {
  const { db } = await import('@/lib/db');
  const { sql } = await import('drizzle-orm');
  // `rate_limit_hit` prunes/decides/appends atomically under a per-key row lock.
  const rows = (await db.execute(
    sql`SELECT allowed, remaining, retry_after_ms
        FROM rate_limit_hit(${key}, ${opts.limit}, ${opts.windowMs}, ${now})`
  )) as Array<{
    allowed: boolean;
    remaining: number;
    retry_after_ms: number;
  }>;
  const row = rows[0]!;
  return {
    allowed: row.allowed,
    remaining: Number(row.remaining),
    retryAfterMs: Number(row.retry_after_ms)
  };
};

/** Shared, cross-instance store backed by Postgres via `rate_limit_hit()`. */
export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly exec: RateLimitExecutor = drizzleExecutor) {}

  async check(
    key: string,
    opts: RateLimitOptions,
    now: number
  ): Promise<RateLimitResult> {
    return this.exec(key, opts, now);
  }

  /** Delete rows whose window fully aged out before `olderThan` (epoch ms). */
  async deleteStale(olderThan: number): Promise<void> {
    const { db, rateLimitHits } = await import('@/lib/db');
    const { lt } = await import('drizzle-orm');
    await db.delete(rateLimitHits).where(lt(rateLimitHits.updatedAt, olderThan));
  }
}

/** Sliding-window limiter: a store, its window config, and an injectable clock. */
export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly opts: RateLimitOptions,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Record a hit for `key` and report whether it is within the limit. */
  async check(key: string): Promise<RateLimitResult> {
    try {
      return await this.store.check(key, this.opts, this.now());
    } catch (err) {
      // Fail OPEN: a store outage must not lock every user out; allow but log for ops.
      console.warn(
        `[rate-limit] store error for key "${key}", allowing request:`,
        err
      );
      return { allowed: true, remaining: this.opts.limit, retryAfterMs: 0 };
    }
  }

  /** Clear all recorded hits (test/maintenance helper). */
  reset(): void | Promise<void> {
    return this.store.reset?.();
  }
}

/** Best-effort client IP from proxy headers, falling back to a shared bucket (fails safe). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    // Trust the RIGHTMOST entry (appended by the trusted proxy), not the
    // client-controlled leftmost — otherwise a caller could mint a fresh bucket
    // per request. Assumes a single trusted proxy hop in front of the app.
    const parts = fwd
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** The environment inputs that select the backing store. */
export interface RateLimitStoreEnv {
  RATE_LIMIT_STORE?: string;
  DATABASE_URL?: string;
  // Index signature so a full `process.env` is assignable without a cast.
  [key: string]: string | undefined;
}

/**
 * Pick the backing store: RATE_LIMIT_STORE forces memory/postgres, else Postgres
 * when DATABASE_URL is set and in-memory otherwise. `env` is injectable for tests.
 */
export function createDefaultStore(
  env: RateLimitStoreEnv = process.env
): RateLimitStore {
  const mode = env.RATE_LIMIT_STORE?.toLowerCase();
  if (mode === 'memory') return new InMemoryRateLimitStore();
  if (mode === 'postgres') return new PostgresRateLimitStore();
  if (env.DATABASE_URL) return new PostgresRateLimitStore();
  return new InMemoryRateLimitStore();
}

// One shared store backs all limiters; keys are namespaced per caller so they never collide.
const store = createDefaultStore();

// Preconfigured limiters: login per IP; register per IP and per targeted email.
export const loginIpLimiter = new RateLimiter(store, {
  limit: 10,
  windowMs: 5 * 60_000
});
export const registerIpLimiter = new RateLimiter(store, {
  limit: 10,
  windowMs: 10 * 60_000
});
export const registerEmailLimiter = new RateLimiter(store, {
  limit: 5,
  windowMs: 60 * 60_000
});
