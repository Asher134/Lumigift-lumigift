/**
 * @jest-environment node
 */

// mockConstructEvent must be defined before jest.mock hoisting
const mockConstructEvent = jest.fn();
const mockQuery = jest.fn();

jest.mock("stripe", () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
  }))
);

jest.mock("@/server/services/gift.service", () => ({
  updateGiftStatus: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    query: mockQuery,
  },
}));

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
jest.mock("@/lib/redis", () => ({
  getRedisClient: jest.fn().mockResolvedValue({
    get: mockRedisGet,
    set: mockRedisSet,
  }),
}));

import { NextRequest } from "next/server";

// POST is loaded lazily inside beforeAll so env vars are set first
let POST: (_req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  process.env.STRIPE_SECRET_KEY = "sk_test_key";

  // jest.isolateModules ensures the route is freshly required with env already set
  await new Promise<void>((resolve) => {
    jest.isolateModules(async () => {
      const mod = await import("../route");
      POST = mod.POST;
      resolve();
    });
  });
});

afterAll(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
});

beforeEach(() => {
  mockConstructEvent.mockReset();
  mockQuery.mockReset();
  mockRedisGet.mockReset();
  mockRedisSet.mockReset();
});

function makeRequest(body: string, sig: string | null) {
  return new NextRequest("http://localhost/api/payments/stripe/webhook", {
    method: "POST",
    body,
    headers: sig ? { "stripe-signature": sig } : {},
  });
}

describe("POST /api/payments/stripe/webhook", () => {
  it("returns 400 when Stripe-Signature header is missing", async () => {
    const res = await POST(makeRequest("{}", null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when signature is invalid", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    const res = await POST(makeRequest("{}", "t=123,v1=badsig"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/signature verification failed/i);
  });

  it("returns 200 when signature is valid", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    mockConstructEvent.mockReturnValue({
      id: "evt_test_123",
      type: "payment_intent.succeeded",
      data: { object: { metadata: {} } },
    });
    const res = await POST(makeRequest("{}", "t=123,v1=validsig"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.received).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("returns 200 immediately for duplicate event IDs", async () => {
    mockQuery.mockResolvedValue({ rows: [{ event_id: "evt_test_456" }] });
    mockConstructEvent.mockReturnValue({
      id: "evt_test_456",
      type: "payment_intent.succeeded",
      data: { object: { metadata: {} } },
    });
    const res = await POST(makeRequest("{}", "t=123,v1=validsig"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.received).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
