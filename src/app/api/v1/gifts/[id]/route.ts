import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGiftById, cancelGift, softDeleteGift } from "@/server/services/gift.service";
import { createAuditLog } from "@/server/services/audit.service";
import { refundPayment } from "@/lib/paystack";
import { withErrorHandler, withCsrf, createErrorResponse, validateRequest } from "@/server/middleware";
import { getCorrelationId } from "@/lib/logger";
import { giftIdParamSchema } from "@/lib/schemas";
import type { ApiResponse, Gift } from "@/types";

export const GET = withErrorHandler(
  async (_req: NextRequest, context: any) => {
    const correlationId = getCorrelationId(_req.headers);
    const params = await context.params;
    const paramValidation = validateRequest(giftIdParamSchema, params, correlationId);
    if (!paramValidation.success) return paramValidation.errorResponse;

    const gift = await getGiftById(paramValidation.data.id);

    if (!gift) {
      return createErrorResponse("NOT_FOUND", "Gift not found", correlationId, 404);
    }

    // Strip sensitive sender info for public claim page
    const safeGift: Partial<Gift> = {
      id: gift.id,
      recipientName: gift.recipientName,
      amountNgn: gift.amountNgn,
      message: gift.message,
      mediaUrl: gift.mediaUrl,
      unlockAt: gift.unlockAt,
      status: gift.status,
    };

    return NextResponse.json<ApiResponse<Partial<Gift>>>({
      success: true,
      data: safeGift,
    });
  }
);

export const DELETE = withErrorHandler(
  withCsrf(async (_req: NextRequest, context: any) => {
    const correlationId = getCorrelationId(_req.headers);
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return createErrorResponse("UNAUTHORIZED", "Unauthorized", correlationId, 401);
    }

    const params = await context.params;
    const paramValidation = validateRequest(giftIdParamSchema, params, correlationId);
    if (!paramValidation.success) return paramValidation.errorResponse;

    const gift = await getGiftById(paramValidation.data.id);

    if (!gift) {
      return createErrorResponse("NOT_FOUND", "Gift not found", correlationId, 404);
    }

    const userId = (session.user as { id: string }).id;
    if (gift.senderId !== userId) {
      return createErrorResponse("FORBIDDEN", "Forbidden", correlationId, 403);
    }

    if (gift.status !== "locked" && gift.status !== "pending_payment") {
      return createErrorResponse("CONFLICT", "Gift cannot be cancelled in its current state", correlationId, 409);
    }

    if (new Date() >= gift.unlockAt) {
      return createErrorResponse("CONFLICT", "Gift unlock time has already passed", correlationId, 409);
    }

    // Trigger Paystack refund (reference convention matches gift creation)
    const paystackRef = `lumigift_${gift.id}`;
    await refundPayment(paystackRef);

    const cancelled = await cancelGift(gift.id);
    // Soft-delete: preserve record for audit trail
    await softDeleteGift(gift.id);
    
    await createAuditLog({
      eventType: "gift_deleted",
      userId,
      giftId: gift.id,
      amountNgn: gift.amountNgn,
      amountUsdc: gift.amountUsdc,
      metadata: {
        status: gift.status,
        recipientName: gift.recipientName,
        unlockAt: gift.unlockAt,
      },
    });

    return NextResponse.json<ApiResponse<Gift>>({
      success: true,
      data: cancelled!,
    });
  })
);
