"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastContext";
import styles from "./CancelGiftModal.module.css";
import type { ApiResponse } from "@/types";

interface CancelGiftModalProps {
  giftId: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * CancelGiftModal — confirmation dialog for cancelling a gift.
 *
 * Accessibility:
 *  - Uses the shared <Modal> base component which implements:
 *      • Focus trap (Tab / Shift+Tab cycles only within the dialog)
 *      • Focus restoration to the trigger element on close
 *      • Escape key to dismiss
 *      • role="dialog" + aria-modal="true" + aria-labelledby
 *  - Satisfies WCAG 2.1 SC 2.1.2 (No Keyboard Trap)
 */
export function CancelGiftModal({ giftId, onClose, onSuccess }: CancelGiftModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  const handleCancel = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/gifts/${giftId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data: ApiResponse<unknown> = await res.json();

      if (!data.success) {
        throw new Error(
          (typeof data.error === "string" ? data.error : (data.error as { message?: string })?.message) ||
            "Failed to cancel gift"
        );
      }

      addToast("Gift cancelled successfully", "success");
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
      addToast(message, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      title="Cancel Gift?"
      description="Are you sure you want to cancel this gift? A refund will be processed automatically to your original payment method."
      onClose={onClose}
    >
      <div className={styles.info}>
        <p>• Refund may take 3-5 business days.</p>
        <p>• This action cannot be undone.</p>
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onClose}
          disabled={isDeleting}
        >
          Go Back
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={handleCancel}
          disabled={isDeleting}
          aria-busy={isDeleting}
        >
          {isDeleting ? "Cancelling…" : "Confirm Cancellation"}
        </button>
      </div>
    </Modal>
  );
}
