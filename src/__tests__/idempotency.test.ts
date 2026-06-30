/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

const mockRedisStore: Record<string, string> = {};
const mockGet = jest.fn(async (key: string) => mockRedisStore[key] ?? null);
const mockSetEx = jest.fn(async (key: string, _ttl: number, value: string) => {
  mockRedisStore[key] = value;
});

jest.mock("@/lib/redis", () => ({
  getRedisClient: jest.fn(async () => ({
    get: mockGet,
    setEx: mockSetEx,
  })),
  redis: {
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn(),
  },
}));

jest.mock("next-auth", () => ({
  getServerSession: jest.fn().mockResolvedValue({
    user: { id: "user-123" },
  }),
}));

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/logger", () => ({
  requestLogger: () => ({ error: jest.fn(), info: jest.fn() }),
  getCorrelationId: () => "test-corr-id",
}));

jest.mock("@/lib/sanitize", () => ({
  sanitizeObject: (obj: any) => obj,
}));

import { withIdempotency } from "@/server/middleware/idempotency";

function makeReq(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: any } = {}
): NextRequest {
  return new NextRequest(url, {
    method: opts.method ?? "POST",
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

describe("withIdempotency", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockRedisStore)) delete mockRedisStore[key];
    mockGet.mockClear();
    mockSetEx.mockClear();
    mockGet.mockImplementation(async (key: string) => mockRedisStore[key] ?? null);
    mockSetEx.mockImplementation(async (key: string, _ttl: number, value: string) => {
      mockRedisStore[key] = value;
    });
  });

  const VALID_KEY = "550e8400-e29b-41d4-a716-446655440000";

  it("passes through when no Idempotency-Key header is provided", async () => {
    const inner = jest.fn(async () =>
      NextResponse.json({ success: true, data: { id: "gift-1" } }, { status: 201 })
    );
    const handler = withIdempotency(inner);
    const res = await handler(makeReq("http://localhost/api/v1/gifts"));
    expect(res.status).toBe(201);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns 400 when Idempotency-Key is not a valid UUID", async () => {
    const inner = jest.fn(async () => NextResponse.json({ success: true }));
    const handler = withIdempotency(inner);
    const res = await handler(
      makeReq("http://localhost/api/v1/gifts", {
        headers: { "idempotency-key": "not-a-uuid" },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(inner).not.toHaveBeenCalled();
  });

  it("executes handler and caches response on first request", async () => {
    const responseData = { success: true, data: { gift: { id: "gift-1" }, paymentUrl: "https://pay.test" } };
    const inner = jest.fn(async () =>
      NextResponse.json(responseData, { status: 201 })
    );
    const handler = withIdempotency(inner);
    const res = await handler(
      makeReq("http://localhost/api/v1/gifts", {
        headers: { "idempotency-key": VALID_KEY },
      })
    );
    expect(res.status).toBe(201);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(mockSetEx).toHaveBeenCalledTimes(1);

    const [key, ttl] = mockSetEx.mock.calls[0];
    expect(key).toBe(`idempotency:user-123:${VALID_KEY}`);
    expect(ttl).toBe(86400);
  });

  it("returns cached response on second request without re-executing handler", async () => {
    const responseData = { success: true, data: { gift: { id: "gift-1" } } };
    const inner = jest.fn(async () =>
      NextResponse.json(responseData, { status: 201 })
    );
    const handler = withIdempotency(inner);

    // First request
    await handler(
      makeReq("http://localhost/api/v1/gifts", {
        headers: { "idempotency-key": VALID_KEY },
      })
    );
    expect(inner).toHaveBeenCalledTimes(1);

    // Second request with same key
    const res = await handler(
      makeReq("http://localhost/api/v1/gifts", {
        headers: { "idempotency-key": VALID_KEY },
      })
    );
    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(201);
    expect(res.headers.get("x-idempotent-replayed")).toBe("true");

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.gift.id).toBe("gift-1");
  });

  it("does not cache non-2xx responses", async () => {
    const inner = jest.fn(async () =>
      NextResponse.json({ success: false, error: "Bad request" }, { status: 400 })
    );
    const handler = withIdempotency(inner);
    const res = await handler(
      makeReq("http://localhost/api/v1/gifts", {
        headers: { "idempotency-key": VALID_KEY },
      })
    );
    expect(res.status).toBe(400);
    expect(mockSetEx).not.toHaveBeenCalled();
  });
});
