import type { NextConfig } from 'next';

// Reduce an origin/URL to the bare host (`host[:port]`, no scheme, no path)
// that Next compares Server Action requests against. Accepts either a full URL
// (`https://foo-3000.lightsprint.ai`) or an already-bare host.
function toHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).host;
  } catch {
    // Not a full URL — assume it is already a bare host, but strip any
    // stray scheme prefix and trailing path just in case.
    return trimmed.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  }
}

// The exact host this deployment is served from, injected by the host platform
// at runtime (e.g. `foo-3000.lightsprint.ai`). When set, Server Actions are
// locked to this single host. When unset (local dev) we fall back to the broad
// preview wildcards below so `bun run dev` keeps working.
const previewHost = process.env.PREVIEW_ORIGIN
  ? toHost(process.env.PREVIEW_ORIGIN)
  : '';

// Broad preview domains, used ONLY as a dev fallback. These are shared
// multi-tenant domains (any sandbox is *.e2b.app / *.lightsprint.ai), so they
// must never be the production allowlist — a scoped `PREVIEW_ORIGIN` overrides
// them below.
const devPreviewOrigins = ['*.lightsprint.ai', '*.e2b.app'];

const isProduction = process.env.NODE_ENV === 'production';

// Server Actions CSRF check: Next 15 rejects requests whose Origin/Host don't
// match. Behind the Lightsprint proxy the app is served at *.lightsprint.ai but
// forwarded with an `x-forwarded-host` of *.e2b.app, so the exact deployment
// origin must be trusted. In production we trust ONLY that exact host (dropping
// the shared-domain wildcards); in dev we allow the broad preview domains as a
// convenience.
const serverActionOrigins = previewHost
  ? [previewHost]
  : isProduction
    ? []
    : devPreviewOrigins;

const nextConfig: NextConfig = {
  // The Lightsprint preview is served from *.lightsprint.ai and forwarded to the
  // *.e2b.app sandbox, so the browser's origin differs from the dev server's.
  // Next's dev server warns on (and will soon block) cross-origin requests to
  // /_next/* resources unless those origins are allowlisted here. This is a
  // dev-server-only setting; prefer the exact host when it is known.
  allowedDevOrigins: previewHost ? [previewHost] : devPreviewOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: serverActionOrigins
    }
  }
};

export default nextConfig;
