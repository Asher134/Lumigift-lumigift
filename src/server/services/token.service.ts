import { randomUUID } from "crypto";
import pool from "@/lib/db";

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedBy?: string | null;
}

/**
 * Creates a new refresh token for a user.
 */
export async function createRefreshToken(userId: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
    [userId, token, expiresAt]
  );
  return token;
}

/**
 * Rotates an old refresh token for a new one.
 * Invalidates the old token and returns the new one.
 * If the old token is already revoked or expired, returns null.
 */
export async function rotateRefreshToken(oldToken: string, userId: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "SELECT id, revoked_at, expires_at FROM refresh_tokens WHERE token = $1 AND user_id = $2 FOR UPDATE",
      [oldToken, userId]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const { id: oldTokenId, revoked_at, expires_at } = rows[0];

    if (revoked_at || new Date() > new Date(expires_at)) {
      await client.query("ROLLBACK");
      return null;
    }

    const newToken = randomUUID();
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 30);

    const insertRes = await client.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING id",
      [userId, newToken, newExpiresAt]
    );
    const newTokenId = insertRes.rows[0].id;

    await client.query(
      "UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $1 WHERE id = $2",
      [newTokenId, oldTokenId]
    );

    await client.query("COMMIT");
    return newToken;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[token.service] Failed to rotate refresh token:", err);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Revokes all refresh tokens for a user (e.g., on logout or security breach).
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId]
  );
}
