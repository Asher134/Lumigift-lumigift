/**
 * Legacy route: GET /api/gifts/group/[id]
 * @deprecated Redirects to /api/v1/gifts/group/[id] with HTTP 301.
 *             Update clients to use /api/v1/gifts/group/{id} directly.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, context: any) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const redirectUrl = new URL(`/api/v1/gifts/group/${id}`, url.origin);
  return NextResponse.redirect(redirectUrl, { status: 301 });
}
