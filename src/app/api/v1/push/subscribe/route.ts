import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { subscribeUserToPush } from "@/server/services/push-notifications.service";
import { withErrorHandler, validateRequest } from "@/server/middleware";
import type { ApiResponse } from "@/types";

import { z } from "zod";

const subscribeSchema = z.object({
  endpoint: z.string().url("endpoint must be a valid URL"),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

async function handler(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const validation = validateRequest(subscribeSchema, body);
  if (!validation.success) return validation.errorResponse;

  await subscribeUserToPush(
    session.user.id,
    validation.data,
    req.headers.get("user-agent") || undefined
  );

  return NextResponse.json<ApiResponse<{ message: string }>>({
    success: true,
    data: { message: "Subscribed to push notifications" },
  });
}

export const POST = withErrorHandler(handler);
