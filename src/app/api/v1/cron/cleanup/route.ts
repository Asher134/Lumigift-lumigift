import { NextRequest, NextResponse } from "next/server";
import { processCleanup } from "@/server/services/scheduler.service";
import { verifyCronAuth } from "@/lib/cron-auth";
import type { ApiResponse } from "@/types";

/**
 * Called weekly by Vercel Cron.
 * Handles data retention policies (e.g., purging audit logs older than 2 years).
 */
export const GET = async (req: NextRequest) => {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  const result = await processCleanup();
  return NextResponse.json<ApiResponse<{ message: string; details: any }>>({
    success: true,
    data: { message: "Cleanup complete", details: result },
  });
};
