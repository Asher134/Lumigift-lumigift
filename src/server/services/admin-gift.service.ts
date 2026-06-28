import type { Gift, GiftStatus } from "@/types";
import { gifts } from "./gift.service";

// ─── Audit log (in-memory; replace with DB table in production) ──────────────

export interface AuditEntry {
  id: string;
  adminId: string;
  action: string;
  targetId: string;
  createdAt: Date;
}

const auditLog: AuditEntry[] = [];

/**
 * Records an admin action in the in‑memory audit log.
 *
 * @param {string} adminId - Identifier of the admin performing the action.
 * @param {string} action - A short description of the action (e.g. "gift_deleted").
 * @param {string} targetId - Identifier of the target entity (gift ID, user ID, etc.).
 * @returns {void}
 */
export function logAdminAction(
  adminId: string,
  action: string,
  targetId: string
): void {
  auditLog.push({
    id: crypto.randomUUID(),
    adminId,
    action,
    targetId,
    createdAt: new Date(),
  });
}

/**
 * Retrieves a copy of the current admin audit log entries.
 *
 * @returns {AuditEntry[]} An array of audit log entries in insertion order.
 */
export function getAuditLog(): AuditEntry[] {
  return [...auditLog];
}

// ─── Admin gift queries ───────────────────────────────────────────────────────

export interface AdminGiftQuery {
  search?: string;   // matches recipientName (case-insensitive)
  status?: GiftStatus;
  cursor?: string;
  limit?: number;
}

export interface AdminGiftPage {
  gifts: Gift[];
  total: number;
  nextCursor: string | null;
}

/**
 * Returns a paginated list of gifts for admin view, applying optional filters.
 *
 * @param {AdminGiftQuery} query - Filtering and pagination options.
 * @returns {AdminGiftPage} An object containing the gifts page, total count, and next cursor.
 * @throws {Error} If query parameters are malformed (e.g., negative limit).
 */
export function adminListGifts(query: AdminGiftQuery): AdminGiftPage {
  const limit = Math.min(query.limit ?? 20, 100);

  let all = [...gifts.values()]
    .filter((g) => !g.deletedAt)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (query.status) {
    all = all.filter((g) => g.status === query.status);
  }

  if (query.search) {
    const term = query.search.toLowerCase();
    all = all.filter((g) => g.recipientName.toLowerCase().includes(term));
  }

  const startIndex = query.cursor
    ? all.findIndex((g) => g.id === query.cursor) + 1
    : 0;

  const page = all.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < all.length ? page[page.length - 1]?.id ?? null : null;

  return { gifts: page, total: all.length, nextCursor };
}

/**
 * Retrieves a single gift by its identifier.
 *
 * @param {string} id - Gift identifier.
 * @returns {Gift | null} The matching gift or `null` if not found.
 */
export function adminGetGift(id: string): Gift | null {
  return gifts.get(id) ?? null;
}

/** Returns all soft-deleted gifts for admin review. */
/**
 * Returns all soft‑deleted gifts for administrative review.
 *
 * @returns {Gift[]} An array of deleted gifts sorted by deletion time descending.
 */
export function adminListDeletedGifts(): Gift[] {
  return [...gifts.values()]
    .filter((g) => g.deletedAt != null)
    .sort((a, b) => b.deletedAt!.getTime() - a.deletedAt!.getTime());
}
