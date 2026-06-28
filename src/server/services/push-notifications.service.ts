import pool from "@/lib/db";
import { serviceLogger } from "@/lib/logger";

const log = serviceLogger("push-notifications");

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function subscribeUserToPush(
  userId: string,
  subscription: PushSubscription,
  userAgent?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET subscribed_at = NOW()`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent]
  );
}

export async function unsubscribeUserFromPush(endpoint: string): Promise<void> {
  await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}

export async function getUserPushSubscriptions(userId: string): Promise<PushSubscription[]> {
  const { rows } = await pool.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );

  return rows.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }));
}

export async function logPushNotification(
  userId: string,
  type: string,
  title: string,
  body: string
): Promise<void> {
  await pool.query(
    `INSERT INTO push_notification_logs (user_id, notification_type, title, body)
     VALUES ($1, $2, $3, $4)`,
    [userId, type, title, body]
  );
}
