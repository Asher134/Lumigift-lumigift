import { NextRequest, NextResponse } from "next/server";
import { processExpiries } from "@/server/services/scheduler.service";
import { verifyCronAuth } from "@/lib/cron-auth";
import type { ApiResponse } from "@/types";

/**
 * Called daily by Vercel Cron.
 * Expires unlocked gifts that have been unclaimed for more than 365 days,
 * triggers a refund to the sender, and sends an SMS notification.
 */
export const GET = async (req: NextRequest) => {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  await processExpiries();
  return NextResponse.json<ApiResponse<{ message: string }>>({
    success: true,
    data: { message: "Expiry check complete" },
  });
};
