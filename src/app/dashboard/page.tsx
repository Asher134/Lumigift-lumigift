"use client";

import { GiftCardSkeleton } from "@/components/gift/GiftCardSkeleton";
import { OnboardingWrapper } from "@/components/onboarding/OnboardingWrapper";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { GiftCard } from "@/components/gift/GiftCard";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import styles from "./page.module.css";
import type { ApiResponse, Gift } from "@/types";
import type { GiftPageOffset } from "@/server/services/gift.service";

const DEFAULT_LIMIT = 20;
const POLL_INTERVAL_MS = 30_000;

const TERMINAL_STATUSES = new Set(["claimed", "cancelled", "expired"]);

function hasNonTerminalGifts(data: GiftPageOffset | undefined): boolean {
  if (!data) return false;
  return data.data.some((g) => !TERMINAL_STATUSES.has(g.status));
}

async function fetchGifts(offset: number, limit: number, status?: string): Promise<GiftPageOffset> {
  const query = new URLSearchParams({
    page: String(Math.floor(offset / limit) + 1),
    limit: String(limit),
  });
  if (status && status !== "all") {
    query.set("status", status);
  }
  const res = await fetch(`/api/v1/gifts?${query.toString()}`);
  const json: ApiResponse<GiftPageOffset> = await res.json();
  if (!json.success) throw new Error(typeof json.error === "string" ? json.error : json.error.message);
  return json.data;
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentStatus = searchParams.get("status") || "all";
  const [loadedGifts, setLoadedGifts] = useState<Gift[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Reset when status changes
  useEffect(() => {
    setLoadedGifts([]);
    setOffset(0);
    setHasMore(true);
  }, [currentStatus]);

  const { data: currentPageData, status, refetch } = useQuery({
    queryKey: ["gifts", offset, currentStatus],
    queryFn: () => fetchGifts(offset, DEFAULT_LIMIT, currentStatus),
    refetchInterval: (query: { state: { data: GiftPageOffset | undefined } }) =>
      hasNonTerminalGifts(query.state.data) ? POLL_INTERVAL_MS : false,
  });

  // Update accumulated gifts when new page data arrives
  useEffect(() => {
    if (!currentPageData) return;
    if (offset === 0) {
      setLoadedGifts(currentPageData.data);
    } else {
      setLoadedGifts((prev): Gift[] => [...prev, ...currentPageData.data]);
    }
    setTotalCount(currentPageData.total);
    setHasMore(loadedGifts.length + currentPageData.data.length < currentPageData.total);
    setIsLoadingMore(false);
  }, [currentPageData]);

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setOffset((prev): number => prev + DEFAULT_LIMIT);
  };

  const handleStatusChange = (newStatus: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newStatus === "all") {
      params.delete("status");
    } else {
      params.set("status", newStatus);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  if (status === "pending" && loadedGifts.length === 0) {
    return (
      <div className={styles.page}>
        <div className="container">
          <div className={styles.header}>
            <h1 className={styles.title}>Your Gifts</h1>
          </div>
          <div className={styles.grid}>
            <GiftCardSkeleton count={6} />
          </div>
        </div>
      </div>
    );
  }

  if (status === "error" && loadedGifts.length === 0) {
    return (
      <div className={styles.page}>
        <div className="container">
          <p>Failed to load gifts. Please try again.</p>
        </div>
      </div>
    );
  }

  const counts = currentPageData?.counts || { all: 0, pending: 0, claimed: 0, expired: 0 };

  const tabs = [
    { id: "all", label: "All", count: counts.all },
    { id: "pending", label: "Pending", count: counts.pending },
    { id: "claimed", label: "Claimed", count: counts.claimed },
    { id: "expired", label: "Expired", count: counts.expired },
  ];

  return (
    <div className={styles.page}>
      <OnboardingWrapper />
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Your Gifts</h1>
          <Link href="/send" className="btn btn--primary btn--sm">
            Send Gift
          </Link>
        </div>

        <div className={styles.tabs}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${currentStatus === tab.id ? styles.tabActive : ""}`}
              onClick={() => handleStatusChange(tab.id)}
            >
              {tab.label}
              <span className={styles.badge}>{tab.count}</span>
            </button>
          ))}
        </div>

        {loadedGifts.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIconWrapper}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="8" width="18" height="4" rx="1" />
                <path d="M12 8v13" />
                <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>No gifts yet</h2>
            <p className={styles.emptyDescription}>
              Brighten someone&apos;s day by sending a surprise cash gift!
            </p>
            <Link href="/send" className="btn btn--primary">
              Send your first gift!
            </Link>
          </div>
        ) : (
          <>
            <p className={styles.count}>
              Showing {loadedGifts.length} of {totalCount} gifts
            </p>
            <div className={styles.grid}>
              {loadedGifts.map((gift) => (
                <ErrorBoundary key={gift.id} name={`GiftCard:${gift.id}`}>
                  <GiftCard gift={gift} perspective="sender" />
                </ErrorBoundary>
              ))}
            </div>
            {hasMore && (
              <div className={styles.loadMore}>
                <button
                  className="btn btn--primary"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore || status === "pending"}
                >
                  {isLoadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
            {isLoadingMore && (
              <div className={styles.grid}>
                <GiftCardSkeleton count={6} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
// .