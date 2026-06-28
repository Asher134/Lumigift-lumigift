import { NextRequest, NextResponse } from "next/server";
import { getQueueStats, type QueueStats } from "@/lib/queues/stellar-tx.queue";
import pool from "@/lib/db";
import type { ApiResponse } from "@/types";

function isAdmin(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

interface QueueStatsResponse {
  stellarTx: QueueStats;
  deadLetterCount: number;
}

export const GET = async (req: NextRequest) => {
  if (!isAdmin(req)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const [stellarTx, deadLetterResult] = await Promise.all([
    getQueueStats(),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM failed_jobs WHERE replayed_at IS NULL`
    ),
  ]);

  return NextResponse.json<ApiResponse<QueueStatsResponse>>({
    success: true,
    data: {
      stellarTx,
      deadLetterCount: parseInt(deadLetterResult.rows[0].count, 10),
    },
  });
};
