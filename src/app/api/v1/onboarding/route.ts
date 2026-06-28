import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import type { ApiResponse } from "@/types";

// GET /api/v1/onboarding — check if current user has completed onboarding
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { rows } = await pool.query(
    "SELECT onboarding_completed_at FROM users WHERE id = $1",
    [session.user.id]
  );

  const completed = !!rows[0]?.onboarding_completed_at;
  return NextResponse.json({ success: true, data: { completed } } satisfies ApiResponse<{ completed: boolean }>);
}

// POST /api/v1/onboarding — mark onboarding as complete
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await pool.query(
    "UPDATE users SET onboarding_completed_at = NOW() WHERE id = $1 AND onboarding_completed_at IS NULL",
    [session.user.id]
  );

  return NextResponse.json({ success: true, data: null } satisfies ApiResponse<null>);
}
