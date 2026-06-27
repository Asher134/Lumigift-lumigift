/**
 * DELETE /api/v1/devices/[fingerprint] — revoke a trusted device
 * Closes #408
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import pool from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse } from "@/types";

export const DELETE = withErrorHandler(
  async (req: NextRequest, context: unknown) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { params } = context as { params: { fingerprint: string } };
    const fingerprint = decodeURIComponent(params.fingerprint);
    const userId = (session.user as { id: string }).id;

    const { rowCount } = await pool.query(
      "DELETE FROM known_devices WHERE user_id = $1 AND fingerprint = $2",
      [userId, fingerprint]
    );

    if (!rowCount) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Device not found" },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<{ revoked: true }>>({
      success: true,
      data: { revoked: true },
    });
  }
);
