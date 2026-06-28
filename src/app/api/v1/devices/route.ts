/**
 * GET  /api/v1/devices  — list trusted devices for the authenticated user
 * Closes #408
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import pool from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse } from "@/types";

export interface TrustedDevice {
  fingerprint: string;
  createdAt: string;
  lastSeenAt: string;
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const userId = (session.user as { id: string }).id;
  const { rows } = await pool.query<{ fingerprint: string; created_at: Date; last_seen_at: Date }>(
    `SELECT fingerprint, created_at, last_seen_at
     FROM known_devices WHERE user_id = $1
     ORDER BY last_seen_at DESC`,
    [userId]
  );

  const devices: TrustedDevice[] = rows.map((r) => ({
    fingerprint: r.fingerprint,
    createdAt: r.created_at.toISOString(),
    lastSeenAt: r.last_seen_at.toISOString(),
  }));

  return NextResponse.json<ApiResponse<TrustedDevice[]>>({ success: true, data: devices });
});
