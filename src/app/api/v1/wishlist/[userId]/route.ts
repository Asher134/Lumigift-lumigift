import { NextRequest, NextResponse } from "next/server";
import { getPublicWishlistByUserId } from "@/server/services/wishlist.service";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse } from "@/types";
import type { Wishlist } from "@/server/services/wishlist.service";

export const GET = withErrorHandler(async (
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) => {
  const { userId } = await params;
  const wishlist = await getPublicWishlistByUserId(userId);
  if (!wishlist) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Wishlist not found" },
      { status: 404 }
    );
  }
  return NextResponse.json<ApiResponse<Wishlist>>({ success: true, data: wishlist });
});
