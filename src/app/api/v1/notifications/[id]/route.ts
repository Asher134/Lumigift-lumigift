import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandler, withCsrf } from "@/server/middleware";
import { markAsRead } from "@/server/services/notification.service";
import type { ApiResponse } from "@/types";

export const PATCH = withErrorHandler(
  withCsrf(async (req: NextRequest, context: any) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    const { id } = await context.params;
    await markAsRead(userId, id);
    return NextResponse.json<ApiResponse<{ ok: boolean }>>({ success: true, data: { ok: true } });
  })
);
