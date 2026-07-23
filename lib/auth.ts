import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db, users } from '@/lib/db';
import { normalizeEmail } from '@/lib/allowlist';
import { eq } from 'drizzle-orm';
import {
  credentialsSchema,
  evaluateAccess,
  resolveUserId
} from '@/lib/auth-policy';

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
    // Runs in middleware for every matched route (see middleware.ts). Thin
    // adapter over the framework-free `evaluateAccess` policy (lib/auth-policy):
    // it gates the whole app behind login (only the sign-in page is public) and
    // confines a seeded default-password account (mustChangePassword) to
    // /change-password until it picks a new one. Here we only translate the
    // decision into what NextAuth expects — the decision itself is unit-tested.
    authorized({ auth, request }) {
      const decision = evaluateAccess({
        pathname: request.nextUrl.pathname,
        isLoggedIn: !!auth?.user,
        mustChangePassword: auth?.user?.mustChangePassword === true
      });
      switch (decision.type) {
        case 'public':
        case 'allow':
          return true;
        case 'unauthenticated':
          // NextAuth redirects to pages.signIn ('/login') with a callbackUrl.
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
 * already read it. The session→id resolution is the pure, unit-tested
 * `resolveUserId` (lib/auth-policy); this wrapper only supplies the live session.
 */
export async function requireUser(): Promise<number> {
  return resolveUserId(await auth());
}
