import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/registration';
import { normalizeEmail } from '@/lib/allowlist';
import {
  clientIp,
  registerIpLimiter,
  registerEmailLimiter
} from '@/lib/rate-limit';

// Thin HTTP adapter: parse the request body, delegate the validation and
// business rules to the registration domain service, and map its result to an
// HTTP response. All account rules live in lib/registration.ts.
//
// To avoid registration enumeration, the response deliberately does NOT reveal
// whether the email was allowlisted or already had an account: every request
// that passes input validation returns the same generic 202 body, whether or
// not an account was actually created (see SECURITY.md). Only genuine
// input-validation failures surface distinctly, as a 400.
//
// Additionally rate-limited per-IP and per-email (best-effort, in-memory — see
// lib/rate-limit.ts) so this open endpoint can't be used for unlimited account
// creation / allowlist probing.
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

    // Throttle per targeted email too, so a distributed source can't hammer a
    // single account/allowlist entry. Only meaningful when an email is present;
    // registerUser still owns the real validation.
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

    // A newly created account joins the board's owner/interviewer picklist
    // (lib/hiring/service/reader.ts `loadUsers`). The board reads are uncached,
    // so the new user is selectable on the next board render — no cache to
    // invalidate here; the client's TanStack Query board cache re-seeds from that
    // render.

    // Uniform response across allowlist-miss / duplicate / success. Never echo
    // result.created — that flag is for server-side logging only.
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
