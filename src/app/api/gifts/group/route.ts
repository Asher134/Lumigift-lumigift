/**
 * Legacy route: POST /api/gifts/group
 * @deprecated Redirects to /api/v1/gifts/group with HTTP 301.
 *             Update clients to use /api/v1/gifts/group directly.
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const redirectUrl = new URL("/api/v1/gifts/group", url.origin);
  return NextResponse.redirect(redirectUrl, { status: 301 });
}
