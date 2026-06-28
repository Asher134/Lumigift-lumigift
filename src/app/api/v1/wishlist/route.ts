import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrCreateWishlist, upsertWishlistItems, setWishlistVisibility } from "@/server/services/wishlist.service";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse } from "@/types";
import type { Wishlist } from "@/server/services/wishlist.service";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const userId = (session.user as { id: string }).id;
  const wishlist = await getOrCreateWishlist(userId);
  return NextResponse.json<ApiResponse<Wishlist>>({ success: true, data: wishlist });
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const userId = (session.user as { id: string }).id;
  const { items, isPublic } = await req.json() as {
    items?: { amountNgn: number; label?: string }[];
    isPublic?: boolean;
  };

  if (typeof isPublic === "boolean") {
    await setWishlistVisibility(userId, isPublic);
  }
  if (items) {
    const wishlist = await upsertWishlistItems(userId, items);
    return NextResponse.json<ApiResponse<Wishlist>>({ success: true, data: wishlist });
  }
  const wishlist = await getOrCreateWishlist(userId);
  return NextResponse.json<ApiResponse<Wishlist>>({ success: true, data: wishlist });
});
