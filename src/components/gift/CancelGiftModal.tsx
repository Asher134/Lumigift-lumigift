"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastContext";
import styles from "./CancelGiftModal.module.css";
import type { ApiResponse } from "@/types";

interface CancelGiftModalProps {
  giftId: string;
  onClose: () => void;
  onSuccess: () => void;
}

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

      const data: ApiResponse<any> = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to cancel gift");
      }

      addToast("Gift cancelled successfully", "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
      addToast(err.message, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Cancel Gift?</h2>
        <p className={styles.description}>
          Are you sure you want to cancel this gift? A refund will be processed
          automatically to your original payment method.
        </p>
        <div className={styles.info}>
          <p>• Refund may take 3-5 business days.</p>
          <p>• This action cannot be undone.</p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button
            className="btn btn--secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            Go Back
          </button>
          <button
            className="btn btn--danger"
            onClick={handleCancel}
            disabled={isDeleting}
          >
            {isDeleting ? "Cancelling..." : "Confirm Cancellation"}
          </button>
        </div>
      </div>
    </div>
  );
}
