// nextjs/auth.ts
// DB-backed Auth.js implementation adhering strictly to CLAIMSETU_AUTH_IMPLEMENTATION_PLAN.md

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { pool } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import type { UserRole } from "@/lib/auth/types";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email).trim().toLowerCase();
        const password = String(credentials.password);

        try {
          // Look up user strictly from PostgreSQL database by case-insensitive email
          const result = await pool.query(
            `SELECT id, email, password, role, is_active
             FROM users
             WHERE LOWER(email) = LOWER($1)
             LIMIT 1`,
            [email]
          );

          const user = result.rows[0];

          // Reject if user not found or account is deactivated
          if (!user || !user.is_active) {
            return null;
          }

          // Plaintext password comparison module (isolated for future hashing)
          if (!verifyPassword(user.password, password)) {
            return null;
          }

          // Return user identity; role is strictly derived from the DB record
          return {
            id: String(user.id),
            userId: String(user.id),
            email: user.email,
            role: user.role as UserRole,
          };
        } catch (err) {
          console.error("[Auth authorize error]", err);
          return null;
        }
      },
    }),
  ],
});
