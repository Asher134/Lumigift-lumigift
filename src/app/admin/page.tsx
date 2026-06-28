"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import styles from "./page.module.css";
import type { ApiResponse } from "@/types";
import type { AdminStats } from "@/app/api/v1/admin/stats/route";
import type { AdminGiftPage } from "@/server/services/admin-gift.service";
import type { AdminUserRow } from "@/app/api/v1/admin/users/route";
import type { Gift } from "@/types";

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET ?? "";

function adminHeaders() {
  return { Authorization: `Bearer ${ADMIN_SECRET}` };
}

async function fetchStats(): Promise<AdminStats> {
  const res = await fetch("/api/v1/admin/stats", { headers: adminHeaders() });
  const json: ApiResponse<AdminStats> = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function fetchGifts(page: number, status: string): Promise<AdminGiftPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set("status", status);
  const res = await fetch(`/api/v1/admin/gifts?${params}`, { headers: adminHeaders() });
  const json: ApiResponse<AdminGiftPage> = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function fetchUsers(page: number): Promise<{ users: AdminUserRow[]; total: number }> {
  const res = await fetch(`/api/v1/admin/users?page=${page}`, { headers: adminHeaders() });
  const json: ApiResponse<{ users: AdminUserRow[]; total: number }> = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function setBanned(userId: string, banned: boolean) {
  await fetch(`/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ banned }),
  });
}

export default function AdminDashboardPage() {
  const [tab, setTab] = useState<"gifts" | "users">("gifts");
  const [giftPage, setGiftPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");

  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: fetchStats });
  const { data: giftsData, refetch: refetchGifts } = useQuery({
    queryKey: ["admin-gifts", giftPage, statusFilter],
    queryFn: () => fetchGifts(giftPage, statusFilter),
  });
  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-users", userPage],
    queryFn: () => fetchUsers(userPage),
    enabled: tab === "users",
  });

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.title}>Admin Dashboard</h1>

        {stats && (
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.totalGifts.toLocaleString()}</span>
              <span className={styles.statLabel}>Total Gifts</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>₦{stats.totalValueNgn.toLocaleString()}</span>
              <span className={styles.statLabel}>Total Value</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{(stats.claimRate * 100).toFixed(1)}%</span>
              <span className={styles.statLabel}>Claim Rate</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.totalUsers.toLocaleString()}</span>
              <span className={styles.statLabel}>Users</span>
            </div>
          </div>
        )}

        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={tab === "gifts"}
            className={tab === "gifts" ? styles.tabActive : styles.tab}
            onClick={() => setTab("gifts")}
          >
            Gifts
          </button>
          <button
            role="tab"
            aria-selected={tab === "users"}
            className={tab === "users" ? styles.tabActive : styles.tab}
            onClick={() => setTab("users")}
          >
            Users
          </button>
        </div>

        {tab === "gifts" && (
          <div>
            <div className={styles.filters}>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setGiftPage(1); }}
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                {["funded", "locked", "unlocked", "claimed", "expired", "cancelled"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th><th>Sender</th><th>Recipient</th><th>Amount (₦)</th><th>Status</th><th>Unlock At</th>
                </tr>
              </thead>
              <tbody>
                {giftsData?.gifts.map((g: any) => (
                  <tr key={g.id}>
                    <td title={g.id}>{g.id.slice(0, 8)}…</td>
                    <td>{g.sender_id.slice(0, 8)}…</td>
                    <td>{g.recipient_phone.replace(/(\+\d{3})\d+(\d{4})/, "$1***$2")}</td>
                    <td>₦{g.amount_ngn.toLocaleString()}</td>
                    <td><span className={`${styles.badge} ${styles[`badge_${g.status}`]}`}>{g.status}</span></td>
                    <td>{new Date(g.unlock_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.pagination}>
              <button disabled={giftPage === 1} onClick={() => setGiftPage((p) => p - 1)}>← Prev</button>
              <span>Page {giftPage}</span>
              <button
                disabled={!giftsData || giftsData.gifts.length < 20}
                onClick={() => setGiftPage((p) => p + 1)}
              >Next →</button>
            </div>
          </div>
        )}

        {tab === "users" && (
          <div>
            <table className={styles.table}>
              <thead>
                <tr><th>ID</th><th>Phone</th><th>Name</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {usersData?.users.map((u) => (
                  <tr key={u.id}>
                    <td title={u.id}>{u.id.slice(0, 8)}…</td>
                    <td>{u.phone.replace(/(\+\d{3})\d+(\d{4})/, "$1***$2")}</td>
                    <td>{u.display_name}</td>
                    <td>{u.banned ? <span className={styles.badge_banned}>Banned</span> : "Active"}</td>
                    <td>
                      <button
                        className="btn btn--secondary"
                        onClick={async () => {
                          await setBanned(u.id, !u.banned);
                          refetchUsers();
                        }}
                      >
                        {u.banned ? "Unban" : "Ban"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.pagination}>
              <button disabled={userPage === 1} onClick={() => setUserPage((p) => p - 1)}>← Prev</button>
              <span>Page {userPage}</span>
              <button
                disabled={!usersData || usersData.users.length < 20}
                onClick={() => setUserPage((p) => p + 1)}
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
