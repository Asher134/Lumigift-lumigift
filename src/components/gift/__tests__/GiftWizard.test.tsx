import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { GiftWizard } from "../GiftWizard";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../TemplateSelector", () => ({
  TemplateSelector: ({ onSelect }: { onSelect: (tpl: { id: string; suggestedMessage?: string }) => void }) => (
    <button
      data-testid="template-selector"
      onClick={() => onSelect({ id: "blank", suggestedMessage: undefined })}
    >
      Select Template
    </button>
  ),
}));

jest.mock("../WizardProgress", () => ({
  WizardProgress: ({ currentStep }: { currentStep: number }) => (
    <div data-testid="wizard-progress">Step {currentStep}</div>
  ),
}));

jest.mock("../GiftPreviewCard", () => ({
  GiftPreviewCard: () => <div data-testid="gift-preview-card" />,
}));

jest.mock("@/components/ui/DateTimePicker", () => ({
  DateTimePicker: () => <div data-testid="datetime-picker" />,
}));

// ── sessionStorage helpers ───────────────────────────────────────────────────

const WIZARD_KEY = "lumigift:gift-wizard-draft";

function getStoredDraft() {
  const raw = window.sessionStorage.getItem(WIZARD_KEY);
  return raw ? JSON.parse(raw) : null;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GiftWizard sessionStorage persistence", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    jest.clearAllMocks();
  });

  it("saves draft to sessionStorage when user advances past step 0", async () => {
    render(<GiftWizard />);

    // Click template to advance to step 1 (STEP_RECIPIENT)
    await act(async () => {
      fireEvent.click(screen.getByTestId("template-selector"));
    });

    // Fill in recipient name
    const nameInput = screen.getByLabelText(/recipient's name/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Amara" } });
    });

    // Draft should be persisted
    const draft = getStoredDraft();
    expect(draft).not.toBeNull();
    expect(draft.step).toBe(1);
    expect(draft.formValues.recipientName).toBe("Amara");
  });

  it("hydrates form state from sessionStorage on mount", async () => {
    // Pre-populate sessionStorage with a partial draft
    window.sessionStorage.setItem(
      WIZARD_KEY,
      JSON.stringify({
        step: 2,
        templateId: "blank",
        formValues: {
          recipientName: "Bob",
          recipientPhone: "+2348012345678",
          amountNgn: 5000,
        },
      })
    );

    render(<GiftWizard />);

    // Should render step 2 (STEP_AMOUNT) with pre-filled values
    await waitFor(() => {
      expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("+2348012345678")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5000")).toBeInTheDocument();
  });

  it("clears draft from sessionStorage when Cancel is clicked", async () => {
    // Pre-populate a draft
    window.sessionStorage.setItem(
      WIZARD_KEY,
      JSON.stringify({
        step: 2,
        templateId: "blank",
        formValues: { recipientName: "Chidi", recipientPhone: "+2348011111111" },
      })
    );

    render(<GiftWizard />);

    // Wait for hydration
    await waitFor(() => {
      expect(screen.getByDisplayValue("Chidi")).toBeInTheDocument();
    });

    // Click Cancel
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    });

    // Draft should be gone
    expect(window.sessionStorage.getItem(WIZARD_KEY)).toBeNull();
  });

  it("does NOT store payment provider in sessionStorage (security guardrail)", async () => {
    render(<GiftWizard />);

    // Advance past step 0
    await act(async () => {
      fireEvent.click(screen.getByTestId("template-selector"));
    });

    const nameInput = screen.getByLabelText(/recipient's name/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Test User" } });
    });

    const draft = getStoredDraft();
    // paymentProvider should NOT be persisted
    expect(draft?.formValues?.paymentProvider).toBeUndefined();
  });

  it("clears draft on successful form submission", async () => {
    // Pre-populate draft at review step
    window.sessionStorage.setItem(
      WIZARD_KEY,
      JSON.stringify({
        step: 4,
        templateId: "blank",
        formValues: {
          recipientName: "Ada",
          recipientPhone: "+2348099999999",
          amountNgn: 3000,
          unlockAt: new Date(Date.now() + 86400000).toISOString(),
        },
      })
    );

    // Mock successful fetch
    global.fetch = jest.fn().mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { paymentUrl: "https://paystack.test/pay/abc" },
        }),
    });

    // Mock location
    const originalLocation = window.location;
    // @ts-expect-error intentional override
    delete window.location;
    window.location = { href: "" } as Location;

    render(<GiftWizard />);

    // Wait for hydration to review step
    await waitFor(() => {
      expect(screen.getByTestId("gift-preview-card")).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: /continue to payment/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(window.sessionStorage.getItem(WIZARD_KEY)).toBeNull();
    });

    // Restore location
    window.location = originalLocation;
  });
});
