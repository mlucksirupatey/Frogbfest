import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/lib/auth/types";

/**
 * Edge-compatible NextAuth configuration.
 * Normalizes legacy or variant role strings so session state is consistent.
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = String(user.id || user.userId);
        token.email = user.email;
        const r = String(user.role || "").toLowerCase();
        token.role = (r === "institutional" || r === "insurer" || r === "adjudicator")
          ? "institutional"
          : "policyholder";
      } else if (token.role) {
        // Normalize existing stored token role
        const r = String(token.role).toLowerCase();
        token.role = (r === "institutional" || r === "insurer" || r === "adjudicator")
          ? "institutional"
          : "policyholder";
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string;
        session.user.userId = token.userId as string;
        session.user.email = (token.email as string) || session.user.email;
        const r = String(token.role || "").toLowerCase();
        session.user.role = (r === "institutional" || r === "insurer" || r === "adjudicator")
          ? "institutional"
          : "policyholder";
      }
      return session;
    },
  },
  providers: [], // Configured with credentials in auth.ts
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "f39e8a71b2d45c60e7f9a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1",
};
