import type { NextAuthConfig } from 'next-auth';
// Empty type-only import anchors `next-auth/jwt` so the augmentation below resolves.
import type {} from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import { evaluateAccess } from '@/lib/auth-policy';

// Edge-safe half of the auth config (the `authorized` gate + JWT session shaping),
// importing nothing Node-only so `middleware.ts` builds the gate without pulling
// postgres into the Edge bundle. The `jwt` strategy lets it decode the session
// from the signed cookie without a DB lookup. `lib/auth.ts` adds the DB provider.

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      // True while the account still has a seeded/default password to replace.
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

export const authConfig = {
  pages: {
    signIn: '/login'
  },
  // No providers here — the DB/bcrypt credentials provider is Node-only, added in `lib/auth.ts`.
  providers: [],
  session: { strategy: 'jwt' },
  callbacks: {
    // Runs in middleware for every matched route: translates the framework-free
    // `evaluateAccess` policy decision into what NextAuth expects.
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
} satisfies NextAuthConfig;
