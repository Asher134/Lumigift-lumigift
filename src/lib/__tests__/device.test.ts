/**
 * @jest-environment node
 *
 * Tests for device fingerprinting utilities (src/lib/device.ts).
 * Closes #408.
 */

import { createHash } from "crypto";

// ─── Mock NextRequest ─────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string>) {
  return {
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
  } as unknown as import("next/server").NextRequest;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildFingerprint", () => {
  it("returns a 64-char hex SHA-256 hash", async () => {
    const { buildFingerprint } = await import("@/lib/device");
    const req = makeRequest({
      "user-agent": "Mozilla/5.0",
      "accept-language": "en-NG,en;q=0.9",
      "accept-encoding": "gzip, deflate, br",
    });
    const fp = buildFingerprint(req);
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same headers", async () => {
    const { buildFingerprint } = await import("@/lib/device");
    const headers = {
      "user-agent": "TestAgent",
      "accept-language": "en",
      "accept-encoding": "gzip",
    };
    const req1 = makeRequest(headers);
    const req2 = makeRequest(headers);
    expect(buildFingerprint(req1)).toBe(buildFingerprint(req2));
  });

  it("differs when user-agent changes", async () => {
    const { buildFingerprint } = await import("@/lib/device");
    const req1 = makeRequest({ "user-agent": "AgentA", "accept-language": "en", "accept-encoding": "gzip" });
    const req2 = makeRequest({ "user-agent": "AgentB", "accept-language": "en", "accept-encoding": "gzip" });
    expect(buildFingerprint(req1)).not.toBe(buildFingerprint(req2));
  });

  it("handles missing headers gracefully (empty strings)", async () => {
    const { buildFingerprint } = await import("@/lib/device");
    const req = makeRequest({});
    const expected = createHash("sha256").update("||").digest("hex");
    expect(buildFingerprint(req)).toBe(expected);
  });
});

describe("getClientIp", () => {
  it("returns the first IP from X-Forwarded-For", async () => {
    const { getClientIp } = await import("@/lib/device");
    const req = makeRequest({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" });
    expect(getClientIp(req)).toBe("203.0.113.10");
  });

  it("returns 'unknown' when header is absent", async () => {
    const { getClientIp } = await import("@/lib/device");
    expect(getClientIp(makeRequest({}))).toBe("unknown");
  });
});
