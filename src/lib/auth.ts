/**
 * Auth.js v5 (NextAuth) configuration with Prisma adapter.
 * Supports email/password (Credentials provider) plus optional Google/GitHub OAuth.
 */
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { db } from "@/lib/db";
import { env } from "@/lib/env";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "USER";
    } & DefaultSession["user"];
  }
}

const providers = [];

if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }));
}
if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET) {
  providers.push(GitHub({ clientId: env.AUTH_GITHUB_ID, clientSecret: env.AUTH_GITHUB_SECRET }));
}

providers.push(
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "").toLowerCase().trim();
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;
      const user = await db.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  secret: env.AUTH_SECRET,
  trustHost: env.AUTH_TRUST_HOST === "true" || env.NODE_ENV !== "production",
  pages: {
    signIn: "/sign-in",
  },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      if (token.email && !token.role) {
        const u = await db.user.findUnique({ where: { email: token.email } });
        if (u) {
          token.id = u.id;
          token.role = u.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = String(token.id);
      if (token?.role) session.user.role = token.role as "ADMIN" | "USER";
      return session;
    },
  },
});

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  return session.user;
}
