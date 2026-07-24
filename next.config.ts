import type { NextConfig } from 'next';

// Reduce an origin/URL to the bare host (`host[:port]`) Next compares Server
// Action requests against. Accepts a full URL or an already-bare host.
function toHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).host;
  } catch {
    // Not a full URL — treat as a bare host, stripping any stray scheme/path.
    return trimmed.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  }
}

// The exact host this deployment is served from (injected at runtime). When set,
// Server Actions lock to it; unset (local dev) falls back to the wildcards below.
const previewHost = process.env.PREVIEW_ORIGIN
  ? toHost(process.env.PREVIEW_ORIGIN)
  : '';

// Broad, shared multi-tenant preview domains — a dev fallback only, never the
// production allowlist (a scoped `PREVIEW_ORIGIN` overrides them below).
const devPreviewOrigins = ['*.lightsprint.ai', '*.e2b.app'];

const isProduction = process.env.NODE_ENV === 'production';

// Server Actions CSRF check (Next 15 rejects mismatched Origin/Host): trust ONLY
// the exact deployment host in production; allow the broad preview domains in dev.
const serverActionOrigins = previewHost
  ? [previewHost]
  : isProduction
    ? []
    : devPreviewOrigins;

const nextConfig: NextConfig = {
  // Dev-server-only: allowlist the preview origins so Next doesn't block
  // cross-origin /_next/* requests (the browser origin differs from the server's).
  allowedDevOrigins: previewHost ? [previewHost] : devPreviewOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: serverActionOrigins
    }
  }
};

export default nextConfig;
