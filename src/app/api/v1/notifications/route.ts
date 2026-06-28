import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandler, withCsrf } from "@/server/middleware";
import { getNotifications, markAllAsRead } from "@/server/services/notification.service";
import type { ApiResponse, Notification } from "@/types";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get("limit") ?? "20", 10), 50);
  const result = await getNotifications(userId, limit);
  return NextResponse.json<ApiResponse<{ notifications: Notification[]; unreadCount: number }>>({
    success: true,
    data: result,
  });
});

export const PATCH = withErrorHandler(
  withCsrf(async (req: NextRequest) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    await markAllAsRead(userId);
    return NextResponse.json<ApiResponse<{ ok: boolean }>>({ success: true, data: { ok: true } });
  })
);
