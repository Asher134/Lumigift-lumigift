import pool from "@/lib/db";
import type { Notification, NotificationType } from "@/types";

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string
): Promise<Notification> {
  const { rows } = await pool.query<{
    id: string; user_id: string; type: string; title: string;
    body: string; read: boolean; created_at: Date;
  }>(
    `INSERT INTO notifications (user_id, type, title, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, type, title, body, read, created_at`,
    [userId, type, title, body]
  );
  const r = rows[0];
  return { id: r.id, userId: r.user_id, type: r.type as NotificationType, title: r.title, body: r.body, read: r.read, createdAt: r.created_at };
}

export async function getNotifications(
  userId: string,
  limit = 20
): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const [listResult, countResult] = await Promise.all([
    pool.query<{ id: string; user_id: string; type: string; title: string; body: string; read: boolean; created_at: Date }>(
      `SELECT id, user_id, type, title, body, read, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    ),
    pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = FALSE",
      [userId]
    ),
  ]);

  const notifications = listResult.rows.map((r) => ({
    id: r.id, userId: r.user_id, type: r.type as NotificationType,
    title: r.title, body: r.body, read: r.read, createdAt: r.created_at,
  }));

  return { notifications, unreadCount: parseInt(countResult.rows[0].count, 10) };
}

export async function markAsRead(userId: string, notificationId: string): Promise<void> {
  await pool.query(
    "UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2",
    [notificationId, userId]
  );
}

export async function markAllAsRead(userId: string): Promise<void> {
  await pool.query(
    "UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE",
    [userId]
  );
}
