import Link from "next/link";
import styles from "./GiftListEmptyState.module.css";

interface GiftListEmptyStateProps {
  /** Optional heading override — defaults to "No gifts yet" */
  heading?: string;
  /** Optional description override */
  description?: string;
}

/**
 * Empty-state illustration and call-to-action shown on the dashboard
 * when a user has no gifts to display.
 *
 * Rendered only after loading completes (caller is responsible for not
 * rendering this during the skeleton/loading phase).
 */
export function GiftListEmptyState({
  heading = "No gifts yet",
  description = "Brighten someone's day by sending a surprise cash gift!",
}: GiftListEmptyStateProps) {
  return (
    <div className={styles.container} data-testid="gift-list-empty-state" role="status">
      <div className={styles.iconWrapper} aria-hidden="true">
        {/* Gift box SVG illustration */}
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
          aria-hidden="true"
          focusable="false"
        >
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M12 8v13" />
          <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
          <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
        </svg>
      </div>

      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.description}>{description}</p>

      <Link href="/send" className="btn btn--primary">
        Send your first gift!
      </Link>
    </div>
  );
}
