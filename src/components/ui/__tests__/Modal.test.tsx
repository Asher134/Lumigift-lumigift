/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, act } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { Modal } from "../Modal";

expect.extend(toHaveNoViolations);

describe("Modal — focus trap & accessibility", () => {
  it("renders a dialog with correct ARIA attributes", () => {
    const onClose = jest.fn();
    render(
      <Modal title="Test dialog" onClose={onClose}>
        <button type="button">Confirm</button>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const heading = screen.getByRole("heading", { name: /test dialog/i });
    expect(dialog).toHaveAttribute("aria-labelledby", heading.id);
  });

  it("passes jest-axe accessibility audit when open", async () => {
    const onClose = jest.fn();
    const { container } = render(
      <Modal title="Accessible dialog" onClose={onClose}>
        <button type="button">Action</button>
      </Modal>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("focuses a focusable child on mount", () => {
    const onClose = jest.fn();
    render(
      <Modal title="Test dialog" onClose={onClose}>
        <button type="button">Confirm</button>
      </Modal>
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /confirm/i }));
  });

  it("closes on Escape key", () => {
    const onClose = jest.fn();
    render(
      <Modal title="Test dialog" onClose={onClose}>
        <button type="button">Confirm</button>
      </Modal>
    );

    fireEvent.keyDown(document, { key: "Escape", code: "Escape", keyCode: 27 });
    expect(onClose).toHaveBeenCalled();
  });

  it("traps Tab — wraps from last to first focusable element", () => {
    const onClose = jest.fn();
    render(
      <Modal title="Tab trap" onClose={onClose}>
        <button type="button">First</button>
        <button type="button">Second</button>
        <button type="button">Third</button>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    const lastFocusable = focusable[focusable.length - 1];
    const firstFocusable = focusable[0];

    lastFocusable.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(firstFocusable);
  });

  it("traps Shift+Tab — wraps from first to last focusable element", () => {
    const onClose = jest.fn();
    render(
      <Modal title="ShiftTab trap" onClose={onClose}>
        <button type="button">First</button>
        <button type="button">Second</button>
        <button type="button">Third</button>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];

    firstFocusable.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastFocusable);
  });

  it("restores focus to the trigger element on unmount", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open modal";
    document.body.appendChild(trigger);
    trigger.focus();

    const onClose = jest.fn();
    const { unmount } = render(
      <Modal title="Test dialog" onClose={onClose}>
        <button type="button">Confirm</button>
      </Modal>
    );

    act(() => unmount());
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
