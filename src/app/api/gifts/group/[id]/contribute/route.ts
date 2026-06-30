/**
 * Legacy route: POST /api/gifts/group/[id]/contribute
 * @deprecated Redirects to /api/v1/gifts/group/[id]/contribute with HTTP 301.
 *             Update clients to use /api/v1/gifts/group/{id}/contribute directly.
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, context: any) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const redirectUrl = new URL(`/api/v1/gifts/group/${id}/contribute`, url.origin);
  return NextResponse.redirect(redirectUrl, { status: 301 });
}
