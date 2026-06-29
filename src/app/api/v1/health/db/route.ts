import { NextResponse } from "next/server";
import pool, { getPoolMetrics } from "@/lib/db";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse } from "@/types";

interface DbHealthResponse {
  status: "ok" | "error";
  metrics: ReturnType<typeof getPoolMetrics>;
  latencyMs: number;
}

export const GET = withErrorHandler(async () => {
  const metrics = getPoolMetrics();
  const start = Date.now();

  try {
    await pool.query("SELECT 1");
    const latencyMs = Date.now() - start;
    return NextResponse.json<ApiResponse<DbHealthResponse>>({
      success: true,
      data: { status: "ok", metrics, latencyMs },
    });
  } catch {
    const latencyMs = Date.now() - start;
    return NextResponse.json<ApiResponse<DbHealthResponse>>(
      { success: true, data: { status: "error", metrics, latencyMs } },
      { status: 503 }
    );
  }
});
