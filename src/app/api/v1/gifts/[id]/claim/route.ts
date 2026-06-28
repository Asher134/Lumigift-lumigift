import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Keypair } from "@stellar/stellar-sdk";
import { authOptions } from "@/lib/auth";
import { getRedisClient } from "@/lib/redis";
import { getGiftById } from "@/server/services/gift.service";
import { claimGift } from "@/server/services/claim.service";
import { claimGiftSchema } from "@/lib/schemas";
import { withErrorHandler, withCsrf, validateRequest } from "@/server/middleware";
import { getInvitationByPhoneAndGift, claimInvitation } from "@/server/services/invitation.service";
import { logger } from "@/lib/logger";
import type { ApiResponse } from "@/types";

/**
 * Verify that the signature was produced by the owner of recipientStellarKey.
 * Returns false if the nonce is unknown/expired OR the signature is invalid.
 */
async function verifyClaimSignature(
  giftId: string,
  nonce: string,
  recipientStellarKey: string,
  signatureHex: string
): Promise<boolean> {
  const redis = await getRedisClient();
  const key = `claim:challenge:${giftId}:${nonce}`;

  // Consume the nonce atomically — prevents replay attacks
  const exists = await redis.get(key);
  if (!exists) return false;
  await redis.del(key);

  try {
    const keypair = Keypair.fromPublicKey(recipientStellarKey);
    const nonceBytes = Buffer.from(nonce, "hex");
    const sigBytes = Buffer.from(signatureHex, "hex");
    return keypair.verify(nonceBytes, sigBytes);
  } catch {
    return false;
  }
}

export const POST = withErrorHandler(withCsrf(async (req: NextRequest, context?: { params?: { id?: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const validation = validateRequest(claimGiftSchema, body);
  if (!validation.success) return validation.errorResponse;

  const { giftId, recipientStellarKey, nonce, signature } = validation.data;

  // ── Verify Stellar keypair ownership ──────────────────────────────────────
  const signatureValid = await verifyClaimSignature(giftId, nonce, recipientStellarKey, signature);
  if (!signatureValid) {
    logger.warn(
      { event: "claim_invalid_signature", giftId, recipientStellarKey },
      "Gift claim rejected: invalid or expired Stellar signature"
    );
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid or expired signature. Please request a new challenge." },
      { status: 401 }
    );
  }

  const gift = await getGiftById(giftId);
  if (!gift) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Gift not found" },
      { status: 404 }
    );
  }

  const phone = (session.user as { phone?: string }).phone;

  if (phone) {
    const invitation = await getInvitationByPhoneAndGift(phone, giftId);
    if (invitation) {
      if (invitation.status !== "accepted") {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: "You must complete registration via the invitation to claim this gift" },
          { status: 403 }
        );
      }
      await claimInvitation(invitation.id);
    }
  }

  const { jobId } = await claimGift(gift, recipientStellarKey);

  return NextResponse.json<ApiResponse<{ jobId: string }>>({
    success: true,
    data: { jobId },
  });
}));
