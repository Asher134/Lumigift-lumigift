import { NextRequest, NextResponse } from "next/server";
import { verifyPayment } from "@/lib/paystack";
import { updateGiftStatus } from "@/server/services/gift.service";
import { validateSlippage } from "@/server/services/exchange-rate.service";
import { withErrorHandler, validateRequest, searchParamsToObject } from "@/server/middleware";
import { paystackCallbackQuerySchema } from "@/lib/schemas";
import { getRedisClient } from "@/lib/redis";

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours

/** Paystack redirects here after payment. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  // ── Validate query params ────────────────────────────────────────────────
  const validation = validateRequest(
    paystackCallbackQuerySchema,
    searchParamsToObject(new URL(req.url).searchParams)
  );

  if (!validation.success) {
    return NextResponse.redirect(new URL("/error?code=bad_callback", req.url));
  }

  const { reference, giftId } = validation.data;

  // ── Idempotency: skip re-processing duplicate callbacks ──────────────────
  const redis = await getRedisClient();
  const idempotencyKey = `paystack:callback:${reference}`;
  const alreadyProcessed = await redis.get(idempotencyKey);
  if (alreadyProcessed) {
    // Already processed — redirect to success (status was already set to locked)
    return NextResponse.redirect(new URL(`/gift/${giftId}/success`, req.url));
  }

  // ── Re-verify payment with Paystack API (never trust callback params alone) ──
  const result = await verifyPayment(reference);

  if (result.status === "success") {
    const slippage = await validateSlippage(giftId);
    if (!slippage.valid) {
      await updateGiftStatus(giftId, "pending_payment");
      const reason = slippage.reason === "rate_expired" ? "rate_expired" : "rate_slippage";
      return NextResponse.redirect(
        new URL(`/gift/${giftId}/payment-failed?reason=${reason}`, req.url)
      );
    }

    await updateGiftStatus(giftId, "locked");
    await redis.set(idempotencyKey, "1", { EX: IDEMPOTENCY_TTL_SECONDS });
    return NextResponse.redirect(new URL(`/gift/${giftId}/success`, req.url));
  }

  await updateGiftStatus(giftId, "pending_payment");
  return NextResponse.redirect(new URL(`/gift/${giftId}/payment-failed`, req.url));
});
