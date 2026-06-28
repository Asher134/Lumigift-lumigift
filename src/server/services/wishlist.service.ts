import pool from "@/lib/db";

export interface WishlistItem {
  id: string;
  wishlistId: string;
  amountNgn: number;
  label?: string;
  fulfilled: boolean;
  createdAt: Date;
}

export interface Wishlist {
  id: string;
  userId: string;
  isPublic: boolean;
  items: WishlistItem[];
  createdAt: Date;
  updatedAt: Date;
}

export async function getOrCreateWishlist(userId: string): Promise<Wishlist> {
  await pool.query(
    `INSERT INTO wishlists (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  return getWishlistByUserId(userId) as Promise<Wishlist>;
}

export async function getWishlistByUserId(userId: string): Promise<Wishlist | null> {
  const { rows } = await pool.query(
    `SELECT w.id, w.user_id, w.is_public, w.created_at, w.updated_at,
            wi.id AS item_id, wi.amount_ngn, wi.label, wi.fulfilled, wi.created_at AS item_created_at
     FROM wishlists w
     LEFT JOIN wishlist_items wi ON wi.wishlist_id = w.id
     WHERE w.user_id = $1
     ORDER BY wi.created_at ASC`,
    [userId]
  );
  if (rows.length === 0) return null;
  return rowsToWishlist(rows);
}

export async function getPublicWishlistByUserId(userId: string): Promise<Wishlist | null> {
  const { rows } = await pool.query(
    `SELECT w.id, w.user_id, w.is_public, w.created_at, w.updated_at,
            wi.id AS item_id, wi.amount_ngn, wi.label, wi.fulfilled, wi.created_at AS item_created_at
     FROM wishlists w
     LEFT JOIN wishlist_items wi ON wi.wishlist_id = w.id
     WHERE w.user_id = $1 AND w.is_public = TRUE
     ORDER BY wi.created_at ASC`,
    [userId]
  );
  if (rows.length === 0) return null;
  return rowsToWishlist(rows);
}

export async function upsertWishlistItems(
  userId: string,
  items: { amountNgn: number; label?: string }[]
): Promise<Wishlist> {
  const wishlist = await getOrCreateWishlist(userId);
  await pool.query(`DELETE FROM wishlist_items WHERE wishlist_id = $1`, [wishlist.id]);
  for (const item of items) {
    await pool.query(
      `INSERT INTO wishlist_items (wishlist_id, amount_ngn, label) VALUES ($1, $2, $3)`,
      [wishlist.id, item.amountNgn, item.label ?? null]
    );
  }
  await pool.query(`UPDATE wishlists SET updated_at = NOW() WHERE id = $1`, [wishlist.id]);
  return getWishlistByUserId(userId) as Promise<Wishlist>;
}

export async function setWishlistVisibility(userId: string, isPublic: boolean): Promise<void> {
  await pool.query(`UPDATE wishlists SET is_public = $1, updated_at = NOW() WHERE user_id = $2`, [
    isPublic,
    userId,
  ]);
}

export async function markItemFulfilled(itemId: string): Promise<void> {
  await pool.query(`UPDATE wishlist_items SET fulfilled = TRUE WHERE id = $1`, [itemId]);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function rowsToWishlist(rows: Record<string, unknown>[]): Wishlist {
  const first = rows[0];
  return {
    id: first.id as string,
    userId: first.user_id as string,
    isPublic: first.is_public as boolean,
    createdAt: first.created_at as Date,
    updatedAt: first.updated_at as Date,
    items: rows
      .filter((r) => r.item_id)
      .map((r) => ({
        id: r.item_id as string,
        wishlistId: first.id as string,
        amountNgn: r.amount_ngn as number,
        label: r.label as string | undefined,
        fulfilled: r.fulfilled as boolean,
        createdAt: r.item_created_at as Date,
      })),
  };
}
