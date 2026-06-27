"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import styles from "./ShareGift.module.css";

interface ShareGiftProps {
  giftId: string;
  recipientName: string;
}

function buildClaimUrl(giftId: string): string {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/gifts/${giftId}`;
}

function buildShareText(recipientName: string, claimUrl: string): string {
  return `🎁 You have a surprise gift waiting, ${recipientName}! Claim it here: ${claimUrl}`;
}

export function ShareGift({ giftId, recipientName }: ShareGiftProps) {
  const [copied, setCopied] = useState(false);

  const claimUrl = buildClaimUrl(giftId);
  const text = buildShareText(recipientName, claimUrl);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(claimUrl);
      } else {
        // Fallback for older browsers or insecure contexts
        const textArea = document.createElement("textarea");
        textArea.value = claimUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const handleShare = async () => {
    // Web Share API — primary on supported browsers
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Lumigift", text, url: claimUrl });
        return;
      } catch {
        // user cancelled or API unavailable — fall through
      }
    }
    // Fallback: use the same copy logic
    handleCopy();
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;

  return (
    <div className={styles.container}>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleCopy}
        aria-label="Copy gift claim link"
        className={styles.copyButton}
      >
        {copied ? "✓ Copied!" : "Copy Link"}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleShare}
        aria-label={copied ? "Link copied" : "Share gift link"}
      >
        Share
      </Button>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
        aria-label="Share on WhatsApp"
      >
        WhatsApp
      </a>

      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
        aria-label="Share on Twitter"
      >
        Twitter
      </a>
    </div>
  );
}
