import { NextRequest, NextResponse } from "next/server";
import { processScheduledNotifications } from "@/server/services/scheduler.service";
import { verifyCronAuth } from "@/lib/cron-auth";
import type { ApiResponse } from "@/types";

/** Called by Vercel Cron every minute to dispatch scheduled gift notifications. */
export const GET = async (req: NextRequest) => {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  const startedAt = new Date();
  try {
    const dispatched = await processScheduledNotifications();
    const durationMs = Date.now() - startedAt.getTime();
    console.log("[cron] notify run complete", { dispatched, durationMs });
    return NextResponse.json<ApiResponse<{ dispatched: number; durationMs: number }>>({
      success: true,
      data: { dispatched, durationMs },
    });
  } catch (err) {
    console.error("[cron] notify run failed", err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Cron job failed" },
      { status: 500 }
    );
  }
};
