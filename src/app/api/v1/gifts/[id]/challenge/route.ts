/**
 * GET /api/v1/gifts/[id]/challenge
 *
 * Issues a one-time challenge nonce that the recipient must sign with their
 * Stellar private key to prove ownership of the provided Stellar address.
 *
 * Flow:
 *   1. Client fetches this endpoint → receives { nonce, expiresAt }
 *   2. Client signs nonce with Stellar keypair
 *   3. Client posts { recipientStellarKey, nonce, signature } to claim endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getRedisClient } from "@/lib/redis";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse } from "@/types";

const CHALLENGE_TTL = 300; // 5 minutes

export const GET = withErrorHandler(
  async (_req: NextRequest, context?: { params?: { id?: string } }) => {
    const giftId = context?.params?.id;
    if (!giftId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Missing gift id" },
        { status: 400 }
      );
    }

    const nonce = randomBytes(32).toString("hex");
    const redis = await getRedisClient();
    await redis.set(`claim:challenge:${giftId}:${nonce}`, "1", { EX: CHALLENGE_TTL });

    const expiresAt = new Date(Date.now() + CHALLENGE_TTL * 1000).toISOString();
    return NextResponse.json<ApiResponse<{ nonce: string; expiresAt: string }>>({
      success: true,
      data: { nonce, expiresAt },
    });
  }
);
