import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/registration';
import { normalizeEmail } from '@/lib/allowlist';
import {
  clientIp,
  registerIpLimiter,
  registerEmailLimiter
} from '@/lib/rate-limit';

// Thin HTTP adapter over lib/registration.ts. Anti-enumeration: every valid request returns the same generic 202 whether or not an account was created (see SECURITY.md); also rate-limited per IP + email.
function tooManyRequests(retryAfterMs: number) {
  const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const ipHit = await registerIpLimiter.check(`register:ip:${ip}`);
    if (!ipHit.allowed) return tooManyRequests(ipHit.retryAfterMs);

    const body = await request.json();

    // Throttle per targeted email too, so a distributed source can't hammer one entry.
    if (typeof body?.email === 'string' && body.email.trim()) {
      const emailHit = await registerEmailLimiter.check(
        `register:email:${normalizeEmail(body.email)}`
      );
      if (!emailHit.allowed) return tooManyRequests(emailHit.retryAfterMs);
    }

    const result = await registerUser(body);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    // No cache to invalidate — board reads are uncached, so a new user is selectable on the next render.

    // Uniform response across allowlist-miss / duplicate / success — never echo result.created (server-side logging only).
    return NextResponse.json(
      {
        message:
          'If this email is eligible, your account has been created. Try signing in, or ask an admin if you need access.'
      },
      { status: 202 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
