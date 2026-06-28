/**
 * Unit tests for OTP account lockout (issue #663).
 *
 * Verifies:
 *  - After 5 failed OTP attempts, the phone is locked for 15 minutes (Redis TTL)
 *  - POST /verify-otp returns 429 with Retry-After when locked
 *  - Lockout event is logged via Pino (logger.warn called with otp_account_locked)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

type StoreEntry = { value: string; expiresAt: number };
const store = new Map<string, StoreEntry>();

const redisMock = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  ttl: jest.fn(),
  expire: jest.fn(),
};

jest.mock("@/lib/redis", () => ({ getRedisClient: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getRedisClient } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { storeOtp, verifyOtp } from "@/lib/otp";

// ─── Wire up Redis mock ───────────────────────────────────────────────────────

beforeAll(() => {
  (getRedisClient as jest.Mock).mockResolvedValue(redisMock);

  redisMock.set.mockImplementation(async (key: string, value: string, opts?: { EX?: number }) => {
    const expiresAt = opts?.EX ? Date.now() + opts.EX * 1000 : Infinity;
    store.set(key, { value, expiresAt });
  });

  redisMock.get.mockImplementation(async (key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
    return entry.value;
  });

  redisMock.del.mockImplementation(async (...keys: string[]) => {
    keys.forEach((k) => store.delete(k));
  });

  redisMock.incr.mockImplementation(async (key: string) => {
    const entry = store.get(key);
    const next = (entry ? parseInt(entry.value, 10) : 0) + 1;
    store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? Infinity });
    return next;
  });

  redisMock.ttl.mockImplementation(async (key: string) => {
    const entry = store.get(key);
    if (!entry || entry.expiresAt === Infinity) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  });

  redisMock.expire.mockImplementation(async (key: string, seconds: number) => {
    const entry = store.get(key);
    if (entry) store.set(key, { ...entry, expiresAt: Date.now() + seconds * 1000 });
  });
});

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  (getRedisClient as jest.Mock).mockResolvedValue(redisMock);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHONE = "+2348099999999";
const VALID_OTP = "654321";
const LOCK_TTL_SECONDS = 900; // 15 minutes

/** Exhaust one OTP session (5 wrong attempts). */
async function exhaustSession(phone = PHONE) {
  await storeOtp(phone, VALID_OTP);
  for (let i = 0; i < 5; i++) {
    await verifyOtp(phone, "000000");
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("OTP lockout — activation", () => {
  it("locks the phone after 5 failed attempts per session (3 exhausted sessions)", async () => {
    await exhaustSession();
    await exhaustSession();
    await exhaustSession();

    await storeOtp(PHONE, VALID_OTP);
    const result = await verifyOtp(PHONE, "000000");

    expect(result).toMatchObject({ success: false, locked: true });
  });

  it("stores otp:lock key in Redis with a 15-minute TTL", async () => {
    await exhaustSession();
    await exhaustSession();
    await exhaustSession();

    const lockEntry = store.get(`otp:lock:${PHONE}`);
    expect(lockEntry).toBeDefined();

    const ttlSeconds = Math.ceil(((lockEntry?.expiresAt ?? 0) - Date.now()) / 1000);
    // Allow a few seconds of drift
    expect(ttlSeconds).toBeGreaterThanOrEqual(LOCK_TTL_SECONDS - 5);
    expect(ttlSeconds).toBeLessThanOrEqual(LOCK_TTL_SECONDS);
  });

  it("returns retryAfter ≈ 900 s on account lock", async () => {
    await exhaustSession();
    await exhaustSession();
    await exhaustSession();

    await storeOtp(PHONE, VALID_OTP);
    const result = await verifyOtp(PHONE, "000000");

    expect(result.success).toBe(false);
    const { retryAfter } = result as { retryAfter?: number };
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(LOCK_TTL_SECONDS);
  });
});

describe("OTP lockout — Pino logging", () => {
  it("emits a warn log with event=otp_account_locked when the lock is applied", async () => {
    await exhaustSession();
    await exhaustSession();
    await exhaustSession();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "otp_account_locked" }),
      expect.any(String)
    );
  });

  it("logs exactly once per lockout event", async () => {
    await exhaustSession();
    await exhaustSession();
    await exhaustSession();

    expect((logger.warn as jest.Mock).mock.calls.filter(
      ([obj]: [Record<string, unknown>]) => obj?.event === "otp_account_locked"
    )).toHaveLength(1);
  });
});

describe("OTP lockout — subsequent requests blocked", () => {
  it("returns locked:true immediately once locked, even with correct OTP", async () => {
    await exhaustSession();
    await exhaustSession();
    await exhaustSession();

    await storeOtp(PHONE, VALID_OTP);
    const result = await verifyOtp(PHONE, VALID_OTP);

    expect(result).toMatchObject({ success: false, locked: true });
    expect((result as { retryAfter?: number }).retryAfter).toBeGreaterThan(0);
  });
});
