/**
 * Legacy route: GET /api/gifts/group/callback
 * @deprecated Redirects to /api/v1/gifts/group/callback with HTTP 301.
 *             Update clients to use /api/v1/gifts/group/callback directly.
 *             Note: Paystack callback URLs must be updated in the Paystack dashboard.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // Preserve all query params (ref, giftId) in the redirect
  const redirectUrl = new URL("/api/v1/gifts/group/callback", url.origin);
  url.searchParams.forEach((value, key) => {
    redirectUrl.searchParams.set(key, value);
  });
  return NextResponse.redirect(redirectUrl, { status: 301 });
}
