import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The Lightsprint preview is served from *.lightsprint.ai and forwarded to the
  // *.e2b.app sandbox, so the browser's origin differs from the dev server's.
  // Next's dev server warns on (and will soon block) cross-origin requests to
  // /_next/* resources unless those origins are allowlisted here.
  allowedDevOrigins: ['*.lightsprint.ai', '*.e2b.app'],
  experimental: {
    // The Lightsprint preview proxy serves the app at *.lightsprint.ai but
    // forwards an `x-forwarded-host` of *.e2b.app (the underlying sandbox).
    // Next 15's Server Actions CSRF check rejects that host/origin mismatch
    // ("Invalid Server Actions request"), which silently aborts every mutation.
    // Trusting both preview domains lets server actions run behind the proxy.
    serverActions: {
      allowedOrigins: ['*.lightsprint.ai', '*.e2b.app']
    }
  }
};

export default nextConfig;
