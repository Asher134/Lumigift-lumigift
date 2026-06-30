import { NextRequest, NextResponse } from "next/server";
import { getGroupGiftById } from "@/server/services/group-gift.service";
import { withErrorHandler, createErrorResponse } from "@/server/middleware";
import { getCorrelationId } from "@/lib/logger";
import type { ApiResponse, GroupGift } from "@/types";

export const GET = withErrorHandler(async (req: NextRequest, context: any) => {
  const correlationId = getCorrelationId(req.headers);
  const { id } = await context.params;
  const gift = await getGroupGiftById(id);
  if (!gift) {
    return createErrorResponse("NOT_FOUND", "Group gift not found", correlationId, 404);
  }
  return NextResponse.json<ApiResponse<GroupGift>>({ success: true, data: gift });
});
