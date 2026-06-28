import { NextRequest, NextResponse } from "next/server";
import { getGroupGiftById } from "@/server/services/group-gift.service";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse, GroupGift } from "@/types";

export const GET = withErrorHandler(async (_req: NextRequest, context: any) => {
  const { id } = await context.params;
  const gift = await getGroupGiftById(id);
  if (!gift) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Group gift not found" },
      { status: 404 }
    );
  }
  return NextResponse.json<ApiResponse<GroupGift>>({ success: true, data: gift });
});
