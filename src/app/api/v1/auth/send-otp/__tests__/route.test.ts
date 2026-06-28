import { NextRequest } from "next/server";
import { POST } from "../route";
import * as redisLib from "@/lib/redis";
import * as smsLib from "@/lib/sms";
import * as otpLib from "@/lib/otp";

jest.mock("@/lib/redis");
jest.mock("@/lib/sms");
jest.mock("@/lib/otp");
jest.mock("@/server/middleware", () => ({
  withErrorHandler: (fn: any) => fn,
  withCsrf: (fn: any) => fn,
  validateRequest: (schema: any, body: any) => ({ success: true, data: body }),
}));

describe("OTP Send Rate Limiting", () => {
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      incr: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
    };
    (redisLib.getRedisClient as jest.Mock).mockResolvedValue(mockRedis);
  });

  it("should allow request within limits and return headers", async () => {
    mockRedis.incr.mockResolvedValue(1); // 1st request
    mockRedis.ttl.mockResolvedValue(600);
    (smsLib.sendOtp as jest.Mock).mockResolvedValue("123456");

    const req = new NextRequest("http://localhost/api/v1/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ phone: "+2348012345678" }),
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("2");
  });

  it("should block request exceeding phone limit (3 per 10 min)", async () => {
    mockRedis.incr.mockResolvedValue(4); // 4th request
    mockRedis.ttl.mockResolvedValue(500);

    const req = new NextRequest("http://localhost/api/v1/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ phone: "+2348012345678" }),
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("500");
    const json = await res.json();
    expect(json.error).toContain("Too many OTP requests for this number");
  });

  it("should block request exceeding IP limit (10 per minute)", async () => {
    // 1st call to incr is for phone (within limit)
    mockRedis.incr.mockResolvedValueOnce(1);
    mockRedis.ttl.mockResolvedValueOnce(600);
    
    // 2nd call to incr is for IP (exceeds limit)
    mockRedis.incr.mockResolvedValueOnce(11);
    mockRedis.ttl.mockResolvedValueOnce(45);

    const req = new NextRequest("http://localhost/api/v1/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ phone: "+2348012345678" }),
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    const json = await res.json();
    expect(json.error).toContain("Too many OTP requests from this IP");
  });
});
