import { NextRequest, NextResponse } from "next/server";
import { unsubscribeUserFromPush } from "@/server/services/push-notifications.service";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse } from "@/types";

async function handler(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));

  if (!body.endpoint || typeof body.endpoint !== "string") {
    return NextResponse.json({ success: false, error: "Endpoint is required" }, { status: 400 });
  }

  await unsubscribeUserFromPush(body.endpoint);

  return NextResponse.json<ApiResponse<{ message: string }>>({
    success: true,
    data: { message: "Unsubscribed from push notifications" },
  });
}

export const POST = withErrorHandler(handler);
