import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
