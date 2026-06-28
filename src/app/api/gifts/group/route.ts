import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createGroupGiftSchema } from "@/types/schemas";
import { createGroupGift } from "@/server/services/group-gift.service";
import { withErrorHandler } from "@/server/middleware";
import { serverConfig } from "@/server/config";
import type { ApiResponse, GroupGift } from "@/types";

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const parsed = createGroupGiftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const userId = (session.user as { id: string }).id;
  const gift = await createGroupGift(userId, parsed.data);
  const shareUrl = `${serverConfig.app.url}/contribute/${gift.shareToken}`;

  return NextResponse.json<ApiResponse<{ gift: GroupGift; shareUrl: string }>>(
    { success: true, data: { gift, shareUrl } },
    { status: 201 }
  );
});
