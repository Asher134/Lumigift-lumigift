import { NextRequest, NextResponse } from "next/server";
import { verifyPayment } from "@/lib/paystack";
import { confirmContribution, failContribution } from "@/server/services/group-gift.service";
import { withErrorHandler } from "@/server/middleware";

/** Paystack redirects here after a group contribution payment. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("ref");
  const giftId = searchParams.get("giftId");

  if (!reference || !giftId) {
    return NextResponse.redirect(new URL("/error?code=bad_callback", req.url));
  }

  const result = await verifyPayment(reference);

  if (result.status === "success") {
    await confirmContribution(giftId, reference);
    return NextResponse.redirect(
      new URL(`/contribute/${giftId}/thank-you`, req.url)
    );
  }

  await failContribution(giftId, reference);
  return NextResponse.redirect(
    new URL(`/contribute/${giftId}?error=payment_failed`, req.url)
  );
});
