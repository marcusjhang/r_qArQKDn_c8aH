import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/registration';

// Thin HTTP adapter: parse the request body, delegate the validation and
// business rules to the registration domain service, and map its result to an
// HTTP response. All account rules live in lib/registration.ts.
//
// To avoid registration enumeration, the response deliberately does NOT reveal
// whether the email was allowlisted or already had an account: every request
// that passes input validation returns the same generic 202 body, whether or
// not an account was actually created (see SECURITY.md). Only genuine
// input-validation failures surface distinctly, as a 400.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await registerUser(body);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

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
