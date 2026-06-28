import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { headers } from "next/headers";
import { verifyOtpSchema } from "@/types/schemas";
import { serverConfig } from "@/server/config";
import pool from "@/lib/db";
import { sendNewDeviceAlert } from "@/lib/sms";
import { getCountryFromIp } from "@/lib/device";
import { createHash } from "crypto";
import { normalizePhone } from "@/lib/phone";
import { verifyOtp } from "@/lib/otp";
import { serviceLogger } from "@/lib/logger";
import { jwtRotationOptions } from "@/lib/jwt-rotation";
import { createRefreshToken, rotateRefreshToken, revokeAllUserTokens } from "@/server/services/token.service";

const log = serviceLogger("auth");

function fingerprintFromHeaders(ua: string, lang: string, enc: string): string {
  return createHash("sha256").update(`${ua}|${lang}|${enc}`).digest("hex");
}

async function handleDeviceCheck(
  userId: string,
  phone: string,
  fingerprint: string,
  ip: string
): Promise<void> {
  const { rows } = await pool.query(
    "SELECT 1 FROM known_devices WHERE user_id = $1 AND fingerprint = $2",
    [userId, fingerprint]
  );

  if (rows.length === 0) {
    // New device — register it and send alert
    await pool.query(
      // eslint-disable-next-line no-restricted-syntax
      `INSERT INTO known_devices (user_id, fingerprint)
       VALUES ($1, $2)
       ON CONFLICT (user_id, fingerprint) DO UPDATE SET last_seen_at = NOW()`,
      [userId, fingerprint]
    );

    const [country] = await Promise.all([getCountryFromIp(ip)]);
    const time = new Date().toUTCString();
    const reportUrl = `${serverConfig.app.url}/api/v1/auth/report-login?uid=${encodeURIComponent(userId)}&fp=${encodeURIComponent(fingerprint)}`;

    // Fire-and-forget — don't block login on SMS failure
    sendNewDeviceAlert(phone, { time, country, reportUrl }).catch((err) =>
      log.error({ err }, "sendNewDeviceAlert failed")
    );
  } else {
    // Known device — refresh last_seen_at
    await pool.query(
      "UPDATE known_devices SET last_seen_at = NOW() WHERE user_id = $1 AND fingerprint = $2",
      [userId, fingerprint]
    );
  }
}

const isProd = process.env.NODE_ENV === "production";

// Cookie security flags — enforced in production, relaxed locally so HTTP dev
// server works without HTTPS.
const secureCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: isProd,
  path: "/",
};

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  jwt: jwtRotationOptions,
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: secureCookieOptions,
    },
    callbackUrl: {
      name: isProd ? "__Secure-next-auth.callback-url" : "next-auth.callback-url",
      options: secureCookieOptions,
    },
    csrfToken: {
      // CSRF token must be readable by the login form JS, so HttpOnly is false.
      // It is still Secure + SameSite=Strict in production.
      name: isProd ? "__Host-next-auth.csrf-token" : "next-auth.csrf-token",
      options: {
        ...secureCookieOptions,
        httpOnly: false,
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: "Phone OTP",
      credentials: {
        phone: { label: "Phone", type: "text" },
        otp: { label: "OTP", type: "text" },
      },
      async authorize(credentials) {
        const parsed = verifyOtpSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const phone = normalizePhone(parsed.data.phone);
        if (!phone) return null;

        const result = await verifyOtp(phone, parsed.data.otp);
        if (!result.success) {
          throw new Error(result.message);
        }

        const { rows } = await pool.query<{ id: string; phone: string; name: string }>(
          "SELECT id, phone, name FROM users WHERE phone = $1",
          [phone]
        );
        if (rows.length === 0) return null;
        const user = rows[0];

        try {
          const reqHeaders = await headers();
          const ua = reqHeaders.get("user-agent") ?? "";
          const lang = reqHeaders.get("accept-language") ?? "";
          const enc = reqHeaders.get("accept-encoding") ?? "";
          const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
          const fingerprint = fingerprintFromHeaders(ua, lang, enc);

          await handleDeviceCheck(user.id, user.phone, fingerprint, ip);
        } catch (err) {
          // Never block login due to device-check errors
          log.error({ err }, "device check error");
        }

        return user;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        const refreshToken = await createRefreshToken(user.id);
        return {
          id: user.id,
          phone: (user as { phone?: string }).phone,
          accessTokenExpires: Date.now() + 15 * 60 * 1000, // 15 minutes
          refreshToken,
        };
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      // Access token has expired, try to rotate the refresh token
      console.log(`[auth] Rotating refresh token for user ${token.id}`);
      const newToken = await rotateRefreshToken(
        token.refreshToken as string,
        token.id as string
      );

      if (!newToken) {
        console.warn(`[auth] Refresh token rotation failed for user ${token.id}`);
        return { ...token, error: "RefreshAccessTokenError" };
      }

      return {
        ...token,
        accessTokenExpires: Date.now() + 15 * 60 * 1000,
        refreshToken: newToken,
      };
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).phone = token.phone as string;
        (session.user as any).error = token.error;
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.id) {
        await revokeAllUserTokens(token.id as string);
      }
    },
  },
};
