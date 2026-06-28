import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { ApiResponse } from "@/types";

export interface PlatformStats {
  totalGiftsSent: number;
  totalValueNgn: number;
}

// Cache result for 1 hour
let cache: { data: PlatformStats; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return NextResponse.json<ApiResponse<PlatformStats>>({ success: true, data: cache.data });
  }

  try {
    const result = await pool.query<{ total_gifts: string; total_value: string }>(
      `SELECT COUNT(*) AS total_gifts, COALESCE(SUM(amount_ngn), 0) AS total_value
       FROM gifts WHERE status NOT IN ('draft', 'pending_payment', 'cancelled')`
    );
    const row = result.rows[0];
    const data: PlatformStats = {
      totalGiftsSent: parseInt(row.total_gifts, 10),
      totalValueNgn: parseFloat(row.total_value),
    };
    cache = { data, expiresAt: now + 60 * 60 * 1000 };
    return NextResponse.json<ApiResponse<PlatformStats>>({ success: true, data });
  } catch {
    // Graceful fallback
    const fallback: PlatformStats = { totalGiftsSent: 0, totalValueNgn: 0 };
    return NextResponse.json<ApiResponse<PlatformStats>>({ success: true, data: fallback });
  }
}
