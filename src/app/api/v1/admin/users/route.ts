import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import type { ApiResponse } from "@/types";

function isAdmin(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export interface AdminUserRow {
  id: string;
  phone: string;
  display_name: string;
  banned: boolean;
  created_at: string;
}

export const GET = async (req: NextRequest) => {
  if (!isAdmin(req)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const [usersResult, countResult] = await Promise.all([
    pool.query<AdminUserRow>(
      `SELECT id, phone, display_name, COALESCE(banned, FALSE) AS banned, created_at
       FROM users ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    ),
    pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM users`),
  ]);

  return NextResponse.json<ApiResponse<{ users: AdminUserRow[]; total: number }>>({
    success: true,
    data: {
      users: usersResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
    },
  });
};
