import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import type { ApiResponse } from "@/types";

function isAdmin(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export interface AdminStats {
  totalGifts: number;
  totalValueNgn: number;
  claimRate: number;
  totalUsers: number;
}

export const GET = async (req: NextRequest) => {
  if (!isAdmin(req)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const [giftsResult, usersResult] = await Promise.all([
    pool.query<{ total: string; total_value: string; claimed: string }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(amount_ngn), 0) AS total_value,
              COUNT(*) FILTER (WHERE status = 'claimed') AS claimed
       FROM gifts WHERE status NOT IN ('draft', 'pending_payment', 'cancelled')`
    ),
    pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM users`),
  ]);

  const g = giftsResult.rows[0];
  const total = parseInt(g.total, 10);
  const claimed = parseInt(g.claimed, 10);

  return NextResponse.json<ApiResponse<AdminStats>>({
    success: true,
    data: {
      totalGifts: total,
      totalValueNgn: parseFloat(g.total_value),
      claimRate: total > 0 ? claimed / total : 0,
      totalUsers: parseInt(usersResult.rows[0].count, 10),
    },
  });
};
