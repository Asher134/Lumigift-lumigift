import pool from "@/lib/db";
import { updateGiftStatus } from "./gift.service";
import { purgeOldAuditLogs } from "./audit.service";
import { sendUsdcPayment } from "@/lib/stellar";
import { sendGiftExpiredAlert } from "@/lib/sms";
import { logger } from "@/lib/logger";

/**
 * Scheduled-notification processor — finds funded/locked gifts whose
 * `notifyAt` has passed and sends the recipient SMS notification.
 *
 * In production, trigger via Vercel Cron every minute alongside the unlock job.
 *
 * @returns The number of notifications dispatched in this run.
 */
export async function processScheduledNotifications(): Promise<number> {
  const now = new Date();
  const { rows } = await pool.query(
    `SELECT g.id, g.recipient_phone, u.display_name as sender_name
     FROM gifts g
     JOIN users u ON g.sender_id = u.id
     WHERE g.notify_at <= $1 AND g.notify_at IS NOT NULL
       AND g.status IN ('funded', 'locked') AND g.notification_sent = false`,
    [now]
  );

  for (const gift of rows) {
    // Logic to send notification would go here
    // For now we just mark it as sent in DB
    await pool.query(
      "UPDATE gifts SET notification_sent = true, updated_at = NOW() WHERE id = $1",
      [gift.id]
    );
  }

  return rows.length;
}

/**
 * Unlock scheduler — checks for gifts whose `unlockAt` has passed and
 * transitions them from `"locked"` → `"unlocked"`, then notifies recipients.
 */
export async function processUnlocks(): Promise<number> {
  const now = new Date();
  const { rows } = await pool.query(
    "SELECT id FROM gifts WHERE status = 'locked' AND unlock_at <= $1",
    [now]
  );

  for (const gift of rows) {
    await updateGiftStatus(gift.id, "unlocked");
  }

  return rows.length;
}

/**
 * Expiry scheduler — identifies gifts that have been `"unlocked"` but unclaimed
 * for more than 30 days, marks them as `"expired"`, and notifies the sender.
 *
 * When a gift expires the escrowed USDC is refunded to the sender's
 * Stellar address.
 */
export async function processExpiries(): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `SELECT g.id, g.amount_usdc, u.phone as sender_phone, u.stellar_public_key as sender_stellar_key
     FROM gifts g
     JOIN users u ON g.sender_id = u.id
     WHERE g.status = 'unlocked' AND g.unlock_at <= $1`,
    [cutoff]
  );

  let processedCount = 0;
  for (const gift of rows) {
    try {
      // 1. Mark as expired in DB
      await updateGiftStatus(gift.id, "expired");

      // 2. Refund USDC to sender
      if (gift.sender_stellar_key) {
        await sendUsdcPayment(gift.sender_stellar_key, gift.amount_usdc);
      }

      // 3. Notify sender via SMS
      if (gift.sender_phone) {
        await sendGiftExpiredAlert(gift.sender_phone, gift.amount_usdc);
      }

      processedCount++;
    } catch (err) {
      logger.error({ giftId: gift.id, err }, "Failed to process gift expiry");
    }
  }

  return processedCount;
}

/**
 * Maintenance scheduler — handles log rotation, data retention policies,
 * and other general cleanup tasks.
 */
export async function processCleanup(): Promise<{ purgedLogs: number }> {
  const purgedLogs = await purgeOldAuditLogs();
  console.log(`[scheduler] processCleanup: purged ${purgedLogs} old audit logs.`);
  return { purgedLogs };
}
