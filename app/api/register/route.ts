import { hash } from 'bcryptjs';
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { isEmailAllowed, normalizeEmail } from '@/lib/allowlist';
import { rateLimit, clientIp } from '@/lib/rate-limit';

// Cap registration attempts per client IP to blunt allowlist enumeration and
// automated signup abuse.
const REGISTER_MAX_ATTEMPTS = 5;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const ip = clientIp(request.headers);
    const rl = rateLimit(`register:${ip}`, {
      limit: REGISTER_MAX_ATTEMPTS,
      windowMs: REGISTER_WINDOW_MS
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const { name, email: rawEmail, password } = await request.json();

    if (!rawEmail || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Normalize once so the allowlist check, duplicate check, and stored value
    // all agree (login normalizes the same way).
    const email = normalizeEmail(rawEmail);

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Signups are restricted to the allowlist (managed in /settings).
    if (!(await isEmailAllowed(email))) {
      return NextResponse.json(
        {
          error:
            'This email is not allowed to sign up. Ask an admin to add it in Settings.'
        },
        { status: 403 }
      );
    }

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await hash(password, 12);

    await db.insert(users).values({
      name: name || null,
      email,
      passwordHash
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
