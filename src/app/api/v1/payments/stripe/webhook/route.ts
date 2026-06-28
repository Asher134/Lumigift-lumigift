import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { constructStripeEvent } from "@/lib/stripe";
import { updateGiftStatus } from "@/server/services/gift.service";
import { getRedisClient } from "@/lib/redis";
import { serverConfig } from "@/server/config";
import type { ApiResponse } from "@/types";
import pool from "@/lib/db";

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

// Next.js must not parse the body — Stripe needs the raw bytes for signature verification.
// In App Router, request body is not pre-parsed, so no config needed.

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Missing Stripe-Signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = serverConfig.stripe.webhookSecret;
  if (!webhookSecret) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Stripe webhook secret not configured" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(serverConfig.stripe.secretKey, {
    apiVersion: "2026-05-27.dahlia",
  });

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = constructStripeEvent(rawBody, sig);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  // First check database for idempotency
  const dbResult = await pool.query(
    "SELECT event_id FROM processed_stripe_events WHERE event_id = $1",
    [event.id]
  );
  
  if (dbResult.rows.length > 0) {
    return NextResponse.json({ success: true, data: { received: true } });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const giftId = session.metadata?.giftId;
        if (giftId) {
          await updateGiftStatus(giftId, "locked");
          console.log(`[stripe] Gift ${giftId} funded successfully via Stripe.`);
        }
        break;
      }
      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed": {
        const obj = event.data.object as any;
        const giftId = obj.metadata?.giftId;
        if (giftId) {
          // We might want a "payment_failed" status or just leave it as "pending_payment"
          // but the state machine might have thoughts.
          console.warn(`[stripe] Payment failed for gift ${giftId}`);
        }
        break;
      }
    }

    // Store event in database
    await pool.query(
      "INSERT INTO processed_stripe_events (event_id) VALUES ($1)",
      [event.id]
    );

    // Also cache in Redis for quick lookups
    const redis = await getRedisClient();
    const idempotencyKey = `stripe:event:${event.id}`;
    await redis.set(idempotencyKey, "1", { EX: IDEMPOTENCY_TTL_SECONDS });

    return NextResponse.json<ApiResponse<{ received: boolean }>>({
      success: true,
      data: { received: true },
    });
  } catch (err: any) {
    console.error(`[stripe] Webhook handler error: ${err.message}`);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
