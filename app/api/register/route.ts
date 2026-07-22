import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/registration';

// Thin HTTP adapter: parse the request body, delegate the validation and
// business rules to the registration domain service, and map its result to an
// HTTP response. All account rules live in lib/registration.ts.
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

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
