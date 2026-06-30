import { NextRequest, NextResponse } from "next/server";
import { withAdmin, withErrorHandler } from "@/server/middleware";
import { adminRefundGift } from "@/server/services/admin.service";
import type { ApiResponse, Gift } from "@/types";

// Protected by withAdmin middleware — only authenticated admin users may access this route.
export const POST = withErrorHandler(
  withAdmin(async (_req: NextRequest, context: any) => {
    const params = await context.params;
    const gift = await adminRefundGift(params.id);

    if (!gift) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Gift not found" },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<Gift>>({ success: true, data: gift });
  })
);
