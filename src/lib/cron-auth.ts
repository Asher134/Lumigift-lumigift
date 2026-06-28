/**
 * HMAC-based secondary authentication for cron endpoints.
 *
 * In addition to the `Authorization: Bearer <CRON_SECRET>` header, callers
 * must supply an `X-Cron-HMAC` header containing a time-based HMAC signature.
 *
 * How it works:
 *   1. The caller computes: HMAC-SHA256(CRON_SECRET, floor(unix_seconds / 60))
 *   2. The digest is hex-encoded and sent as the `X-Cron-HMAC` header.
 *   3. The server recomputes the HMAC for the current 60-second window *and*
 *      the previous window (clock skew tolerance), then compares with a
 *      constant-time equality check to prevent timing attacks.
 *
 * This prevents replay attacks: a captured HMAC token is only valid for at
 * most ~120 seconds.
 *
 * Usage:
 *   import { verifyCronAuth } from "@/lib/cron-auth";
 *
 *   const err = verifyCronAuth(req);
 *   if (err) return err;
 */

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/types";

const WINDOW_SECONDS = 60;

function hmacHex(secret: string, timestamp: number): string {
  return createHmac("sha256", secret).update(String(timestamp)).digest("hex");
}

/**
 * Verifies cron auth: Bearer token + time-based HMAC.
 *
 * @returns `null` on success, or a `NextResponse` 401 to return immediately.
 */
export function verifyCronAuth(req: NextRequest): NextResponse<ApiResponse<never>> | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Misconfigured server — block the request
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Cron secret not configured" },
      { status: 500 }
    );
  }

  // 1. Bearer token check
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // 2. HMAC check
  const clientHmac = req.headers.get("x-cron-hmac");
  if (!clientHmac) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Missing X-Cron-HMAC header" },
      { status: 401 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const windows = [
    Math.floor(now / WINDOW_SECONDS),
    Math.floor(now / WINDOW_SECONDS) - 1, // allow one previous window for clock skew
  ];

  const clientBuf = Buffer.from(clientHmac, "utf8");
  const valid = windows.some((w) => {
    const expected = hmacHex(cronSecret, w);
    const expectedBuf = Buffer.from(expected, "utf8");
    return (
      clientBuf.length === expectedBuf.length &&
      timingSafeEqual(clientBuf, expectedBuf)
    );
  });

  if (!valid) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid or expired HMAC signature" },
      { status: 401 }
    );
  }

  return null;
}
