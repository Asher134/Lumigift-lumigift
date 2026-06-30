/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { CancelGiftModal } from "../CancelGiftModal";

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock("@/components/ui/ToastContext", () => ({
  useToast: () => ({ addToast: jest.fn() }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────
function renderModal(overrides: Partial<Parameters<typeof CancelGiftModal>[0]> = {}) {
  const defaultProps = {
    giftId: "gift-123",
    onClose: jest.fn(),
    onSuccess: jest.fn(),
    ...overrides,
  };
  return render(<CancelGiftModal {...defaultProps} />);
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("CancelGiftModal — focus trap & accessibility", () => {
  it("renders a dialog with correct ARIA attributes", () => {
    renderModal();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Heading must be associated via aria-labelledby
    const heading = screen.getByRole("heading", { name: /cancel gift/i });
    expect(dialog).toHaveAttribute("aria-labelledby", heading.id);
  });

  it("passes jest-axe accessibility audit when open", async () => {
    const { container } = renderModal();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("traps Tab focus — wraps from last to first focusable element", () => {
    renderModal();

    const dialog = screen.getByRole("dialog");
    const focusableElements = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // Move focus to the last element
    lastFocusable.focus();
    expect(document.activeElement).toBe(lastFocusable);

    // Pressing Tab should wrap to the first element
    fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(firstFocusable);
  });

  it("traps Shift+Tab focus — wraps from first to last focusable element", () => {
    renderModal();

    const dialog = screen.getByRole("dialog");
    const focusableElements = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // Move focus to the first element
    firstFocusable.focus();
    expect(document.activeElement).toBe(firstFocusable);

    // Pressing Shift+Tab should wrap to the last element
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastFocusable);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when overlay backdrop is clicked", () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    const backdrop = document.querySelector("[role='presentation']") as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the trigger element on close", () => {
    // Create a button that "opened" the modal
    const trigger = document.createElement("button");
    trigger.textContent = "Cancel gift";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = renderModal();

    // On unmount the Modal cleanup should restore focus
    act(() => unmount());
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });
});
