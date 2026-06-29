/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock("@/lib/redis", () => ({
  getRedisClient: jest.fn().mockResolvedValue({ get: mockGet, set: mockSet }),
}));

const mockUpdateGiftStatus = jest.fn();
jest.mock("@/server/services/gift.service", () => ({
  updateGiftStatus: mockUpdateGiftStatus,
}));

const mockVerifyPayment = jest.fn();
jest.mock("@/lib/paystack", () => ({
  verifyPayment: mockVerifyPayment,
}));

const mockValidateSlippage = jest.fn();
jest.mock("@/server/services/exchange-rate.service", () => ({
  validateSlippage: mockValidateSlippage,
}));

jest.mock("@/server/config", () => ({
  serverConfig: {
    paystack: { secretKey: "test-secret" },
    redis: { url: "redis://localhost:6379" },
    database: { url: "postgresql://localhost/test", poolMin: 1, poolMax: 5, idleTimeoutMs: 10000, connectionTimeoutMs: 5000 },
    auth: { secret: "test-secret", secretPrevious: undefined, rotationGraceHours: 24, csrfSecret: "csrf-secret" },
    cors: { allowedOrigins: ["http://localhost:3000"] },
  },
}));

jest.mock("pg", () => ({ Pool: jest.fn().mockReturnValue({ query: jest.fn(), end: jest.fn(), on: jest.fn() }) }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCallbackRequest(reference: string, giftId: string) {
  return new NextRequest(
    `http://localhost/api/v1/payments/callback?reference=${reference}&giftId=${giftId}`
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/v1/payments/callback (Paystack callback)", () => {
  let GET: (_req: NextRequest) => Promise<Response>;

  const GIFT_ID = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(async () => {
    jest.resetModules();
    mockGet.mockReset();
    mockSet.mockReset();
    mockUpdateGiftStatus.mockReset();
    mockVerifyPayment.mockReset();
    mockValidateSlippage.mockReset();
    ({ GET } = await import("@/app/api/v1/payments/callback/route"));
  });

  it("re-verifies payment with Paystack and sets gift to locked on success", async () => {
    mockGet.mockResolvedValue(null); // not already processed
    mockVerifyPayment.mockResolvedValue({ status: "success", amountKobo: 500000, reference: "ref-ok" });
    mockValidateSlippage.mockResolvedValue({ valid: true });

    const req = makeCallbackRequest("ref-ok", GIFT_ID);
    const res = await GET(req);

    expect(mockVerifyPayment).toHaveBeenCalledWith("ref-ok");
    expect(mockUpdateGiftStatus).toHaveBeenCalledWith(GIFT_ID, "locked");
    expect(mockSet).toHaveBeenCalledWith(
      `paystack:callback:ref-ok`,
      "1",
      { EX: 86400 }
    );
    expect(res.status).toBe(307); // redirect to /gift/:id/success
    expect(res.headers.get("location")).toContain(`/gift/${GIFT_ID}/success`);
  });

  it("returns 200 (redirect to success) without re-processing a duplicate callback", async () => {
    mockGet.mockResolvedValue("1"); // already processed

    const req = makeCallbackRequest("ref-dup", GIFT_ID);
    const res = await GET(req);

    expect(mockVerifyPayment).not.toHaveBeenCalled();
    expect(mockUpdateGiftStatus).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(`/gift/${GIFT_ID}/success`);
  });

  it("sets gift to pending_payment when Paystack verify returns failed", async () => {
    mockGet.mockResolvedValue(null);
    mockVerifyPayment.mockResolvedValue({ status: "failed", amountKobo: 0, reference: "ref-fail" });

    const req = makeCallbackRequest("ref-fail", GIFT_ID);
    const res = await GET(req);

    expect(mockUpdateGiftStatus).toHaveBeenCalledWith(GIFT_ID, "pending_payment");
    expect(mockSet).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain(`/gift/${GIFT_ID}/payment-failed`);
  });

  it("redirects to error page for invalid query params", async () => {
    const req = new NextRequest("http://localhost/api/v1/payments/callback?reference=");
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/error?code=bad_callback");
    expect(mockVerifyPayment).not.toHaveBeenCalled();
  });
});
