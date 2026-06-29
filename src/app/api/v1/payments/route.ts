import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { serverConfig } from "@/server/config";
import { updateGiftStatus } from "@/server/services/gift.service";
import { getRedisClient } from "@/lib/redis";
import { createErrorResponse, validateRequest } from "@/server/middleware";
import { getCorrelationId } from "@/lib/logger";
import { paystackWebhookSchema } from "@/lib/schemas";

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours

function verifySignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha512", serverConfig.paystack.secretKey)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.padEnd(a.length, "\0").slice(0, a.length));
  return a.length === Buffer.from(signature).length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req.headers);
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!signature) {
    return createErrorResponse("UNAUTHORIZED", "Missing Paystack signature", correlationId, 401);
  }

  if (!verifySignature(rawBody, signature)) {
    console.warn("Rejected Paystack webhook with invalid signature");
    return createErrorResponse("UNAUTHORIZED", "Invalid signature", correlationId, 401);
  }

  let rawEvent: unknown;
  try {
    rawEvent = JSON.parse(rawBody);
  } catch {
    return createErrorResponse("VALIDATION_ERROR", "Invalid JSON", correlationId, 400);
  }

  // ── Step 3: Validate the parsed event shape with Zod ────────────────────
  const validation = validateRequest(paystackWebhookSchema, rawEvent);
  if (!validation.success) return validation.errorResponse;

  const event = validation.data;
  const { reference } = event.data;
  const redis = await getRedisClient();
  const idempotencyKey = `paystack:ref:${reference}`;

  // Return 200 immediately for already-processed references (idempotency)
  const alreadyProcessed = await redis.get(idempotencyKey);
  if (alreadyProcessed) {
    return NextResponse.json({ received: true });
  }

  if (event.event === "charge.success") {
    const giftId = event.data.metadata?.giftId;
    if (giftId) {
      await updateGiftStatus(giftId, "locked");
    }
  }

  // Mark reference as processed with 24-hour TTL
  await redis.set(idempotencyKey, "1", { EX: IDEMPOTENCY_TTL_SECONDS });

  return NextResponse.json({ received: true });
}
