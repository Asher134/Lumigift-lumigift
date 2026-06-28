import type { Gift, GiftStatus, User } from "@/types";
import { getGiftById, updateGiftStatus } from "./gift.service";

// ─── In-memory user store (replace with DB in production) ────────────────────
const users = new Map<string, User & { banned?: boolean }>();

/**
 * Retrieves all gifts applying optional filters.
 *
 * @param {{status?: GiftStatus; userId?: string; from?: Date; to?: Date}} filters - Filtering options.
 * @returns {Promise<Gift[]>} A promise that resolves to an array of matching gifts.
 * @throws {Error} If the underlying data source fails.
 */
export async function adminGetAllGifts(filters: {
  status?: GiftStatus;
  userId?: string;
  from?: Date;
  to?: Date;
}): Promise<Gift[]> {
  // In production this would be a DB query with WHERE clauses.
  // For now we import the in-memory map via the service layer.
  const { getAllGifts } = await import("./gift.service");
  let results = await getAllGifts();

  if (filters.status) results = results.filter((g) => g.status === filters.status);
  if (filters.userId) results = results.filter((g) => g.senderId === filters.userId);
  if (filters.from) results = results.filter((g) => g.createdAt >= filters.from!);
  if (filters.to) results = results.filter((g) => g.createdAt <= filters.to!);

  return results;
}

/**
 * Expires a gift by setting its status to `expired`.
 *
 * @param {string} id - Identifier of the gift to expire.
 * @returns {Promise<Gift | null>} The updated gift or `null` if not found.
 * @throws {Error} If the update operation fails.
 */
export async function adminExpireGift(id: string): Promise<Gift | null> {
  return updateGiftStatus(id, "expired");
}

/**
 * Refunds a gift by marking it as `cancelled` (and triggering a payment refund in production).
 *
 * @param {string} id - Identifier of the gift to refund.
 * @returns {Promise<Gift | null>} The updated gift or `null` if not found.
 * @throws {Error} If the refund process fails.
 */
export async function adminRefundGift(id: string): Promise<Gift | null> {
  const gift = await getGiftById(id);
  if (!gift) return null;
  // In production: trigger Paystack refund API here.
  return updateGiftStatus(id, "cancelled");
}

/**
 * Bans a user by setting the `banned` flag to true. If the user does not exist, a placeholder record is created.
 *
 * @param {string} id - User identifier to ban.
 * @returns {Promise<{id: string; banned: boolean} | null>} The ban record or `null` if operation fails.
 * @throws {Error} If updating the user store fails.
 */
export async function adminBanUser(id: string): Promise<{ id: string; banned: boolean } | null> {
  const user = users.get(id);
  if (!user) {
    // Stub: create a placeholder banned record if user not in memory store.
    users.set(id, {
      id,
      phone: "",
      displayName: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      banned: true,
    });
    return { id, banned: true };
  }
  user.banned = true;
  user.updatedAt = new Date();
  users.set(id, user);
  return { id, banned: true };
}
