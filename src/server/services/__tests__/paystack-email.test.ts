/**
 * @jest-environment node
 *
 * Unit tests for issue #579:
 * "Fix Paystack payment initialization using placeholder sender email"
 *
 * Verifies that createGift fetches the real user email from the DB
 * and passes it to Paystack, with correct fallback when no email is on file.
 */

import { initializePayment } from "@/lib/paystack";
import { getExchangeRate } from "@/server/services/exchange-rate.service";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/paystack", () => ({
  initializePayment: jest.fn(),
  ngnToKobo: jest.fn((ngn: number) => ngn * 100),
}));

jest.mock("@/server/services/exchange-rate.service", () => ({
  getExchangeRate: jest.fn(),
  lockExchangeRate: jest.fn().mockResolvedValue({ lockedRate: 1600, expiresAt: 9999999999 }),
}));

jest.mock("@/server/config", () => ({
  serverConfig: {
    app: { url: "http://localhost:3000", name: "Lumigift" },
    giftLimits: { minAmountNgn: 500, maxAmountNgn: 500000, dailyLimitNgn: 1000000 },
    paystack: { secretKey: "sk_test_placeholder" },
    stellar: { network: "testnet", horizonUrl: "https://horizon-testnet.stellar.org" },
    usdc: { assetCode: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
  },
}));

// DB mock — controlled per-test to return different user rows
const mockDbQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockDbQuery(...args) },
}));

jest.mock("@/server/services/audit.service", () => ({
  createAuditLog: jest.fn().mockResolvedValue("audit-id"),
}));

jest.mock("@/server/services/invitation.service", () => ({
  createGiftInvitation: jest.fn().mockResolvedValue("invite-token"),
}));

jest.mock("@/lib/sms", () => ({
  sendGiftInvitation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/email", () => ({
  sendGiftReceivedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/server/services/fraud.service", () => ({
  checkGiftForFraud: jest.fn().mockResolvedValue({ flagged: false, reasons: [], severity: "low" }),
  createFraudFlag: jest.fn().mockResolvedValue(undefined),
}));

import { createGift, gifts } from "../gift.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SENDER_ID = "user-abc-123";
const REAL_EMAIL = "ada@example.com";
const FALLBACK_EMAIL = `${SENDER_ID}@lumigift.app`;
const PAYMENT_URL = "https://paystack.com/pay/test-ref";

// recipientIsRegistered=true (default) so no display_name query is executed.
const baseInput = {
  recipientPhone: "+2348012345678",
  recipientName: "Tunde Bakare",
  amountNgn: 5000,
  message: "Congrats!",
  unlockAt: new Date(Date.now() + 86_400_000).toISOString(),
  paymentProvider: "paystack" as const,
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  gifts.clear();

  (getExchangeRate as jest.Mock).mockResolvedValue({ ngnPerUsdc: 1600 });
  (initializePayment as jest.Mock).mockResolvedValue({
    authorizationUrl: PAYMENT_URL,
    reference: `lumigift_test-ref`,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("createGift — Paystack email (issue #579)", () => {
  it("passes the real user email from the DB to Paystack", async () => {
    // For a registered recipient the only DB call in the happy path is the email lookup.
    mockDbQuery.mockResolvedValue({ rows: [{ email: REAL_EMAIL }] });

    await createGift(SENDER_ID, baseInput, /* recipientIsRegistered */ true);

    expect(initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({ email: REAL_EMAIL })
    );
  });

  it("falls back to placeholder when the user has no email on file (NULL)", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ email: null }] });

    await createGift(SENDER_ID, baseInput, true);

    expect(initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({ email: FALLBACK_EMAIL })
    );
  });

  it("falls back to placeholder when the user row does not exist", async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    await createGift(SENDER_ID, baseInput, true);

    expect(initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({ email: FALLBACK_EMAIL })
    );
  });

  it("never passes the placeholder email when a real email is available", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ email: REAL_EMAIL }] });

    await createGift(SENDER_ID, baseInput, true);

    const callArgs = (initializePayment as jest.Mock).mock.calls[0][0];
    expect(callArgs.email).not.toBe(FALLBACK_EMAIL);
    expect(callArgs.email).toBe(REAL_EMAIL);
  });

  it("queries the users table with the correct senderId to obtain the email", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ email: REAL_EMAIL }] });

    await createGift(SENDER_ID, baseInput, true);

    // Find the email-SELECT call among all DB calls
    const emailCall = mockDbQuery.mock.calls.find(
      ([sql]: [string]) =>
        typeof sql === "string" &&
        sql.toLowerCase().includes("select") &&
        sql.toLowerCase().includes("email") &&
        sql.toLowerCase().includes("users")
    );

    expect(emailCall).toBeDefined();
    // The senderId must be passed as a query parameter
    expect(emailCall![1]).toContain(SENDER_ID);
  });

  it("still creates the gift and returns the paymentUrl when a real email is used", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ email: REAL_EMAIL }] });

    const { gift, paymentUrl } = await createGift(SENDER_ID, baseInput, true);

    expect(gift).toMatchObject({ senderId: SENDER_ID, status: "pending_payment" });
    expect(paymentUrl).toBe(PAYMENT_URL);
  });

  // ── Unregistered recipient path (display_name + email queries) ──────────────
  it("also uses real email when recipient is unregistered (invitation path)", async () => {
    // First query: display_name for the invitation SMS
    // Second query: email for Paystack
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ display_name: "Ada Obi" }] }) // display_name
      .mockResolvedValueOnce({ rows: [{ email: REAL_EMAIL }] });       // email

    await createGift(SENDER_ID, baseInput, /* recipientIsRegistered */ false);

    expect(initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({ email: REAL_EMAIL })
    );
  });
});
