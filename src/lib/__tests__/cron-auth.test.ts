/**
 * @jest-environment node
 */
import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";

const SECRET = "test-cron-secret-xyz";

function makeHmac(windowOffset = 0): string {
  const window = Math.floor(Date.now() / 1000 / 60) + windowOffset;
  return createHmac("sha256", SECRET).update(String(window)).digest("hex");
}

function makeReq(opts: { bearer?: string; hmac?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.bearer !== undefined) headers["authorization"] = `Bearer ${opts.bearer}`;
  if (opts.hmac !== undefined) headers["x-cron-hmac"] = opts.hmac;
  return new NextRequest("https://lumigift.com/api/v1/cron/unlock", { headers });
}

describe("verifyCronAuth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns null for valid bearer + current-window HMAC", () => {
    const req = makeReq({ bearer: SECRET, hmac: makeHmac(0) });
    expect(verifyCronAuth(req)).toBeNull();
  });

  it("returns null for previous-window HMAC (clock skew tolerance)", () => {
    const req = makeReq({ bearer: SECRET, hmac: makeHmac(-1) });
    expect(verifyCronAuth(req)).toBeNull();
  });

  it("returns 401 for missing bearer token", async () => {
    const req = makeReq({ hmac: makeHmac(0) });
    expect(verifyCronAuth(req)?.status).toBe(401);
  });

  it("returns 401 for wrong bearer token", () => {
    const req = makeReq({ bearer: "wrong", hmac: makeHmac(0) });
    expect(verifyCronAuth(req)?.status).toBe(401);
  });

  it("returns 401 for missing HMAC header", () => {
    const req = makeReq({ bearer: SECRET });
    expect(verifyCronAuth(req)?.status).toBe(401);
  });

  it("returns 401 for HMAC older than one window", () => {
    const req = makeReq({ bearer: SECRET, hmac: makeHmac(-2) });
    expect(verifyCronAuth(req)?.status).toBe(401);
  });

  it("returns 401 for tampered HMAC", () => {
    const req = makeReq({ bearer: SECRET, hmac: "0".repeat(64) });
    expect(verifyCronAuth(req)?.status).toBe(401);
  });

  it("returns 500 when CRON_SECRET env var is missing", () => {
    delete process.env.CRON_SECRET;
    const req = makeReq({ bearer: SECRET, hmac: makeHmac(0) });
    expect(verifyCronAuth(req)?.status).toBe(500);
  });
});
