import type { NextAuthConfig } from 'next-auth';
// Empty type-only import: anchors `next-auth/jwt` in this module's import graph
// so the `declare module 'next-auth/jwt'` augmentation below resolves (TS only
// augments an imported module). No named binding, so no unused-vars warning.
import type {} from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import { evaluateAccess } from '@/lib/auth-policy';

// Edge-safe half of the auth config. It holds everything the middleware needs to
// gate a request — the `authorized` page gate and the JWT session shaping — but
// deliberately imports NOTHING Node-only (no `lib/db.ts`/postgres, no bcryptjs).
//
// `middleware.ts` runs on the Edge runtime and instantiates NextAuth from THIS
// config alone, so the postgres client never enters the Edge bundle (which would
// otherwise warn: "A Node.js module is loaded ('stream') … not supported in the
// Edge Runtime"). `lib/auth.ts` spreads this config and adds the DB-backed
// credentials provider for the Node runtime (the API route + server-side
// `auth()`), where importing the database is fine.
//
// Session strategy is `jwt`, so the middleware can decode and shape the session
// from the signed cookie without any provider or database lookup.

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

export const authConfig = {
  pages: {
    signIn: '/login'
  },
  // No providers here: the credentials provider's `authorize` reads the DB and
  // hashes with bcrypt, both Node-only. It is added in `lib/auth.ts`. The
  // middleware doesn't need a provider — it only verifies the existing JWT.
  providers: [],
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
} satisfies NextAuthConfig;
