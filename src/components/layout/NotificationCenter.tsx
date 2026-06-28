"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Notification } from "@/types";
import styles from "./NotificationCenter.module.css";

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/notifications");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data.notifications);
        setUnreadCount(json.data.unreadCount);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleMarkOne(id: string) {
    const csrf = document.cookie.match(/lumigift-csrf=([^;]+)/)?.[1] ?? "";
    await fetch(`/api/v1/notifications/${id}`, {
      method: "PATCH",
      headers: { "x-csrf-token": csrf },
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function handleMarkAll() {
    const csrf = document.cookie.match(/lumigift-csrf=([^;]+)/)?.[1] ?? "";
    await fetch("/api/v1/notifications", {
      method: "PATCH",
      headers: { "x-csrf-token": csrf },
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        className={styles.bell}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {/* Bell icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown} role="dialog" aria-label="Notifications">
          <div className={styles.header}>
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button className={styles.markAll} onClick={handleMarkAll}>
                Mark all as read
              </button>
            )}
          </div>
          <ul className={styles.list} role="list">
            {notifications.length === 0 ? (
              <li className={styles.empty}>No notifications yet</li>
            ) : (
              notifications.map((n) => (
                <li
                  key={n.id}
                  className={`${styles.item} ${!n.read ? styles.itemUnread : ""}`}
                  onClick={() => !n.read && handleMarkOne(n.id)}
                  role="listitem"
                >
                  <span className={`${styles.dot} ${n.read ? styles.dotRead : ""}`} aria-hidden="true" />
                  <div className={styles.content}>
                    <p className={styles.title}>{n.title}</p>
                    <p className={styles.body}>{n.body}</p>
                    <span className={styles.time}>{timeAgo(n.createdAt)}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
