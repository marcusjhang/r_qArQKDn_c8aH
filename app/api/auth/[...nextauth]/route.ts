import { NextResponse, type NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { clientIp, loginIpLimiter } from '@/lib/rate-limit';

// GET is unauthenticated session/CSRF plumbing — passed straight through.
export const { GET } = handlers;

// Throttle credential sign-in per IP (best-effort, in-memory — see
// lib/rate-limit.ts) so the login endpoint isn't open to unlimited password
// guessing. Only the credentials-callback POST is limited; the other NextAuth
// POSTs (csrf, signout) pass through untouched.
export async function POST(request: NextRequest) {
  if (new URL(request.url).pathname.endsWith('/callback/credentials')) {
    const hit = loginIpLimiter.check(`login:ip:${clientIp(request)}`);
    if (!hit.allowed) {
      const retryAfter = Math.max(1, Math.ceil(hit.retryAfterMs / 1000));
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }
  }
  return handlers.POST(request);
}
