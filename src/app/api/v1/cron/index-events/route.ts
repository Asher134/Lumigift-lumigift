import { NextRequest, NextResponse } from "next/server";
import { indexEscrowEvents } from "@/server/services/event-indexer.service";
import { verifyCronAuth } from "@/lib/cron-auth";
import type { ApiResponse } from "@/types";

/**
 * Cron endpoint — indexes Soroban escrow contract events and syncs gift status.
 *
 * Called by Vercel Cron (or an external scheduler) on a regular cadence.
 * Protected by Bearer token + HMAC (see src/lib/cron-auth.ts).
 *
 * Vercel cron config (vercel.json):
 *   { "path": "/api/v1/cron/index-events", "schedule": "* * * * *" }
 */
export const GET = async (req: NextRequest) => {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();

  try {
    const result = await indexEscrowEvents();
    const durationMs = Date.now() - startedAt;

    console.log("[cron/index-events]", { ...result, durationMs });

    return NextResponse.json<
      ApiResponse<{ processed: number; skipped: number; latestCursor: string; durationMs: number }>
    >({
      success: true,
      data: { ...result, durationMs },
    });
  } catch (err) {
    console.error("[cron/index-events] failed", err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Event indexing failed" },
      { status: 500 }
    );
  }
};
