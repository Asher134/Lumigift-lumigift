import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createGroupGiftSchema } from "@/types/schemas";
import { createGroupGift } from "@/server/services/group-gift.service";
import { withErrorHandler, withCsrf, withAuth, createErrorResponse } from "@/server/middleware";
import { getCorrelationId } from "@/lib/logger";
import { serverConfig } from "@/server/config";
import type { ApiResponse, GroupGift } from "@/types";

/**
 * POST /api/v1/gifts/group
 * Create a new group gift pool. Requires authentication + CSRF.
 */
export const POST = withErrorHandler(
  withCsrf(
    withAuth(async (req: NextRequest) => {
      const correlationId = getCorrelationId(req.headers);
      // withAuth already verified the session; retrieve it for the userId
      const session = await getServerSession(authOptions);
      const userId = (session!.user as { id: string }).id;

      const body = await req.json().catch(() => ({}));
      const parsed = createGroupGiftSchema.safeParse(body);
      if (!parsed.success) {
        return createErrorResponse(
          "VALIDATION_ERROR",
          parsed.error.issues[0].message,
          correlationId,
          400
        );
      }

      const gift = await createGroupGift(userId, parsed.data);
      const shareUrl = `${serverConfig.app.url}/contribute/${gift.shareToken}`;

      return NextResponse.json<ApiResponse<{ gift: GroupGift; shareUrl: string }>>(
        { success: true, data: { gift, shareUrl } },
        { status: 201 }
      );
    })
  )
);
