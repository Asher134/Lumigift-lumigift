/**
 * @jest-environment jsdom
 *
 * Tests for ShareGift component — covers Web Share API, clipboard fallback,
 * and secondary share links (WhatsApp, Twitter). Closes #570.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareGift } from "../ShareGift";

const GIFT_ID = "test-gift-123";
const RECIPIENT = "Ada";

beforeEach(() => {
  // Reset clipboard mock
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

describe("ShareGift", () => {
  it("renders the Share button and secondary links", () => {
    render(<ShareGift giftId={GIFT_ID} recipientName={RECIPIENT} />);
    expect(screen.getByRole("button", { name: /share gift link/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /whatsapp/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /twitter/i })).toBeInTheDocument();
  });

  it("uses Web Share API when available", async () => {
    const mockShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });

    render(<ShareGift giftId={GIFT_ID} recipientName={RECIPIENT} />);
    fireEvent.click(screen.getByRole("button", { name: /share gift link/i }));

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringContaining(GIFT_ID) })
      );
    });

    // Clipboard should NOT be called when Web Share API is used
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

    // Restore
    delete (navigator as unknown as Record<string, unknown>).share;
  });

  it("falls back to clipboard when navigator.share is unavailable", async () => {
    // Ensure share is not available
    delete (navigator as unknown as Record<string, unknown>).share;

    render(<ShareGift giftId={GIFT_ID} recipientName={RECIPIENT} />);
    fireEvent.click(screen.getByRole("button", { name: /share gift link/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining(GIFT_ID)
      );
    });

    expect(await screen.findByText("✓ Copied!")).toBeInTheDocument();
  });

  it("falls back to clipboard when navigator.share rejects", async () => {
    const mockShare = jest.fn().mockRejectedValue(new Error("AbortError"));
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });

    render(<ShareGift giftId={GIFT_ID} recipientName={RECIPIENT} />);
    fireEvent.click(screen.getByRole("button", { name: /share gift link/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    delete (navigator as unknown as Record<string, unknown>).share;
  });

  it("WhatsApp link contains the gift URL and recipient name", () => {
    render(<ShareGift giftId={GIFT_ID} recipientName={RECIPIENT} />);
    const wa = screen.getByRole("link", { name: /whatsapp/i }) as HTMLAnchorElement;
    expect(wa.href).toContain("wa.me");
    expect(decodeURIComponent(wa.href)).toContain(RECIPIENT);
  });

  it("Twitter link contains the gift URL", () => {
    render(<ShareGift giftId={GIFT_ID} recipientName={RECIPIENT} />);
    const tw = screen.getByRole("link", { name: /twitter/i }) as HTMLAnchorElement;
    expect(tw.href).toContain("twitter.com/intent/tweet");
    expect(decodeURIComponent(tw.href)).toContain(GIFT_ID);
  });
});
