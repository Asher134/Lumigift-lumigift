import { randomUUID } from "crypto";
import type { GroupGift, GroupContribution } from "@/types";
import type { CreateGroupGiftInput, ContributeInput } from "@/types/schemas";
import { initializePayment, ngnToKobo } from "@/lib/paystack";
import { serverConfig } from "@/server/config";

// ─── In-memory store (replace with DB in production) ─────────────────────────
const groupGifts = new Map<string, GroupGift>();
// shareToken → groupGiftId index
const tokenIndex = new Map<string, string>();

export async function createGroupGift(
  creatorId: string,
  input: CreateGroupGiftInput
): Promise<GroupGift> {
  const id = randomUUID();
  const shareToken = randomUUID().replace(/-/g, "");

  const gift: GroupGift = {
    id,
    creatorId,
    recipientPhone: input.recipientPhone,
    recipientName: input.recipientName,
    targetAmountNgn: input.targetAmountNgn,
    collectedAmountNgn: 0,
    message: input.message,
    unlockAt: new Date(input.unlockAt),
    deadline: new Date(input.deadline),
    status: "open",
    contributions: [],
    shareToken,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  groupGifts.set(id, gift);
  tokenIndex.set(shareToken, id);
  return gift;
}

export async function getGroupGiftById(id: string): Promise<GroupGift | null> {
  return groupGifts.get(id) ?? null;
}

export async function getGroupGiftByToken(token: string): Promise<GroupGift | null> {
  const id = tokenIndex.get(token);
  return id ? (groupGifts.get(id) ?? null) : null;
}

export async function initiateContribution(
  groupGiftId: string,
  input: ContributeInput
): Promise<{ contribution: GroupContribution; paymentUrl: string }> {
  const gift = groupGifts.get(groupGiftId);
  if (!gift) throw new Error("Group gift not found");
  if (gift.status !== "open") throw new Error("This group gift is no longer accepting contributions");

  const now = new Date();
  if (now > gift.deadline) {
    gift.status = "expired";
    gift.updatedAt = new Date();
    throw new Error("Contribution deadline has passed");
  }

  const contributionId = randomUUID();
  const reference = `lumigift_grp_${contributionId}`;

  const contribution: GroupContribution = {
    id: contributionId,
    groupGiftId,
    contributorName: input.contributorName,
    contributorPhone: input.contributorPhone,
    amountNgn: input.amountNgn,
    paymentReference: reference,
    status: "pending",
    createdAt: new Date(),
  };

  gift.contributions.push(contribution);
  gift.updatedAt = new Date();

  const payment = await initializePayment({
    email: input.contributorPhone
      ? `${input.contributorPhone.replace(/\D/g, "")}@lumigift.app`
      : `contributor-${contributionId}@lumigift.app`,
    amountKobo: ngnToKobo(input.amountNgn),
    reference,
    callbackUrl: `${serverConfig.app.url}/api/gifts/group/callback?ref=${reference}&giftId=${groupGiftId}`,
    metadata: { groupGiftId, contributionId, type: "group_contribution" },
  });

  return { contribution, paymentUrl: payment.authorizationUrl };
}

export async function confirmContribution(
  groupGiftId: string,
  paymentReference: string
): Promise<GroupGift> {
  const gift = groupGifts.get(groupGiftId);
  if (!gift) throw new Error("Group gift not found");

  const contribution = gift.contributions.find(
    (c) => c.paymentReference === paymentReference
  );
  if (!contribution) throw new Error("Contribution not found");

  contribution.status = "success";
  gift.collectedAmountNgn += contribution.amountNgn;
  gift.updatedAt = new Date();

  if (gift.collectedAmountNgn >= gift.targetAmountNgn) {
    gift.status = "funded";
  }

  return gift;
}

export async function failContribution(
  groupGiftId: string,
  paymentReference: string
): Promise<void> {
  const gift = groupGifts.get(groupGiftId);
  if (!gift) return;
  const contribution = gift.contributions.find(
    (c) => c.paymentReference === paymentReference
  );
  if (contribution) {
    contribution.status = "failed";
    gift.updatedAt = new Date();
  }
}

export async function getGroupGiftsByCreator(creatorId: string): Promise<GroupGift[]> {
  return [...groupGifts.values()].filter((g) => g.creatorId === creatorId);
}
