import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { db, users } from '@/lib/db';
import { normalizeEmail } from '@/lib/allowlist';
import { gateDecision, resolveUserId } from '@/lib/auth-gate';
import { eq } from 'drizzle-orm';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      // True while the account still has a seeded/default password it must
      // replace before using the app (see the `authorized` gate below).
      mustChangePassword?: boolean;
    };
  }

  interface User {
    id?: string;
    mustChangePassword?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    mustChangePassword?: boolean;
  }
}

// Validate the untyped credentials payload at the authorize boundary. On any
// parse failure we return null (an authentication failure) rather than throw.
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: {
    signIn: '/login'
  },
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' }
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, normalizeEmail(email)))
          .limit(1);

        if (!user) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: String(user.id),
          // Session display name is derived from the stored name parts (the
          // `name` column was removed); falls back to null when neither is set.
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
          email: user.email,
          mustChangePassword: user.mustChangePassword
        };
      }
    })
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    // Runs in middleware for every matched route (see middleware.ts). Gates the
    // whole app behind login: only the sign-in page is public. Returning false
    // redirects to pages.signIn ('/login') with a callbackUrl back to the route.
    //
    // Second gate: an account that still carries the seeded default password
    // (mustChangePassword) is confined to the /change-password page until it
    // picks a new one — every other page route redirects there, and once the
    // flag is cleared the page itself redirects back to the board.
    //
    // The branching itself is the pure `gateDecision` (lib/auth-gate.ts) so it
    // stays unit-testable without NextAuth/the DB client; here we only map its
    // decision onto the callback's boolean | NextResponse contract.
    authorized({ auth, request }) {
      const decision = gateDecision(request.nextUrl.pathname, auth?.user);
      switch (decision.type) {
        case 'allow':
          return true;
        case 'deny':
          return false;
        case 'redirect':
          return NextResponse.redirect(new URL(decision.to, request.nextUrl));
      }
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      session.user.mustChangePassword = token.mustChangePassword === true;
      return session;
    }
  }
});

/**
 * Auth guard for Server Actions. Returns the signed-in user's numeric id, or
 * throws `Unauthorized` when there is no session.
 *
 * The `authorized` callback above only gates *page* routes: Server Actions
 * dispatch by action id (via the `Next-Action` header), and that request can be
 * POSTed to the public `/login` route, which the page gate lets through. So the
 * middleware never protects an action — every action must confirm the session
 * itself. Throwing (rather than silently no-op'ing) aborts before any DB write
 * and, for the optimistic board actions, triggers the client store's rollback.
 *
 * Uses the numeric id set on the session (see the `session` callback) as the
 * "signed in" signal, matching how `lib/profile.ts` and the settings actions
 * already read it. The id coercion/validity check is the pure `resolveUserId`
 * (lib/auth-gate.ts) so it is unit-testable without a live session.
 */
export async function requireUser(): Promise<number> {
  const session = await auth();
  const id = resolveUserId(session?.user?.id);
  if (id === null) throw new Error('Unauthorized');
  return id;
}
