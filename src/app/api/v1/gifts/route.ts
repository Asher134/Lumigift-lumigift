import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createGiftSchema, giftsQuerySchema } from "@/lib/schemas";
import {
  createGift,
  getGiftsBySenderPaginated,
  getGiftsBySenderPage,
} from "@/server/services/gift.service";
import { checkRapidGiftCreation } from "@/server/services/account-takeover.service";
import {
  withErrorHandler,
  withCsrf,
  createErrorResponse,
  validateRequest,
  searchParamsToObject,
} from "@/server/middleware";
import { withIdempotency } from "@/server/middleware/idempotency";
import { getCorrelationId } from "@/lib/logger";
import type { ApiResponse, Gift } from "@/types";
import type { GiftPage, GiftPageOffset } from "@/server/services/gift.service";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const correlationId = getCorrelationId(req.headers);
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return createErrorResponse("UNAUTHORIZED", "Unauthorized", correlationId, 401);
  }
  const userId = (session.user as { id: string }).id;

  const validation = validateRequest(
    giftsQuerySchema,
    searchParamsToObject(req.nextUrl.searchParams),
    correlationId
  );
  if (!validation.success) return validation.errorResponse;

  const { page, limit, status, cursor, pageSize } = validation.data;

  if (
    req.nextUrl.searchParams.has("page") ||
    req.nextUrl.searchParams.has("limit") ||
    req.nextUrl.searchParams.has("status")
  ) {
    const result = await getGiftsBySenderPage(userId, page, limit, status);
    return NextResponse.json<ApiResponse<GiftPageOffset>>({ success: true, data: result });
  }

  const page2 = await getGiftsBySenderPaginated(userId, cursor ?? null, pageSize);
  return NextResponse.json<ApiResponse<GiftPage>>({ success: true, data: page2 });
});

export const POST = withErrorHandler(
  withCsrf(
    withIdempotency(async (req: NextRequest) => {
      const correlationId = getCorrelationId(req.headers);
      const session = await getServerSession(authOptions);
      if (!session?.user) {
        return createErrorResponse("UNAUTHORIZED", "Unauthorized", correlationId, 401);
      }

      const body = await req.json().catch(() => ({}));
      const validation = validateRequest(createGiftSchema, body, correlationId);
      if (!validation.success) return validation.errorResponse;

      const userId = (session.user as { id: string }).id;
      const { gift, paymentUrl } = await createGift(
        userId,
        validation.data,
        validation.data.recipientIsRegistered
      );

      await checkRapidGiftCreation(userId).catch(() => {});

      return NextResponse.json<ApiResponse<{ gift: Gift; paymentUrl: string }>>(
        { success: true, data: { gift, paymentUrl } },
        { status: 201 }
      );
    })
  )
);
