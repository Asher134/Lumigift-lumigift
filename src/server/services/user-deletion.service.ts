// .
import pool from "@/lib/db";
import { createAuditLog } from "./audit.service";

/**
 * Deletes or anonymizes all personal data for a user in compliance with NDPR/GDPR.
 *
 * Data retention exceptions (not deleted):
 * - audit_logs: financial records retained for 7 years (regulatory requirement)
 * - gifts: financial records retained; only message/media PII is cleared
 * - data_deletion_requests: compliance log retained permanently
 *
 * @param userId - The authenticated user's ID
 * @param ipAddress - Request IP for audit trail
 * @returns The deletion request ID for confirmation
 */
export async function deleteUserData(
  userId: string,
  ipAddress?: string
): Promise<{ requestId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Log the deletion request
    const { rows: [req] } = await client.query<{ id: string }>(
      `INSERT INTO data_deletion_requests (user_id, ip_address, status)
       VALUES ($1, $2, 'pending') RETURNING id`,
      [userId, ipAddress ?? null]
    );
    const requestId = req.id;

    // 2. Anonymize gift messages and media (retain financial records)
    await client.query(
      `UPDATE gifts
       SET message = NULL, voice_note_url = NULL, media_url = NULL, updated_at = NOW()
       WHERE sender_id = $1`,
      [userId]
    );

    // 3. Delete device tracking records
    await client.query(
      "DELETE FROM user_devices WHERE user_id = $1",
      [userId]
    );

    // 4. Delete gift invitations (PII: recipient phone)
    await client.query(
      `DELETE FROM gift_invitations
       WHERE gift_id IN (SELECT id FROM gifts WHERE sender_id = $1)`,
      [userId]
    );

    // 5. Anonymize the user record (retain ID for FK integrity)
    await client.query(
      `UPDATE users
       SET phone = 'deleted-' || $1,
           display_name = 'Deleted User',
           email = NULL,
           avatar_url = NULL,
           stellar_public_key = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    // 6. Mark deletion request complete
    await client.query(
      `UPDATE data_deletion_requests
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1`,
      [requestId]
    );

    await client.query("COMMIT");

    // 7. Audit log (outside transaction — append-only table)
    await createAuditLog({
      eventType: "gift_cancelled", // closest available type; metadata clarifies
      userId,
      ipAddress,
      metadata: { action: "data_deletion", requestId, regulation: "NDPR/GDPR" },
    });

    return { requestId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
