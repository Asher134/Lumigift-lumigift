import { normalizePhone, hashPhone, detectPhoneHashCollision } from "@/lib/phone";

describe("normalizePhone", () => {
  // ─── Nigerian formats that must all resolve to the same E.164 ───────────────
  const canonical = "+2348012345678";

  const validNigerianInputs: [string, string][] = [
    ["+2348012345678", canonical], // already E.164
    ["2348012345678", canonical], // international without +
    ["08012345678", canonical], // local with leading 0
    ["8012345678", canonical], // bare 10-digit
    [" +234 801 234 5678 ", canonical], // spaces stripped
    ["+234-801-234-5678", canonical], // dashes stripped
  ];

  test.each(validNigerianInputs)("normalizes %s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  // ─── All Nigerian network prefix groups (070x, 080x, 081x, 090x) ───────────
  const networkPrefixInputs: [string, string][] = [
    // 070x — Glo
    ["07012345678", "+2347012345678"],
    ["07023456789", "+2347023456789"],
    // 080x — MTN / Airtel
    ["08012345678", "+2348012345678"],
    ["08023456789", "+2348023456789"],
    // 081x — MTN
    ["08112345678", "+2348112345678"],
    ["08123456789", "+2348123456789"],
    // 090x — Airtel / 9mobile / Glo
    ["09012345678", "+2349012345678"],
    ["09023456789", "+2349023456789"],
    // International format equivalents
    ["+2347012345678", "+2347012345678"],
    ["+2348112345678", "+2348112345678"],
    ["+2349012345678", "+2349012345678"],
  ];

  test.each(networkPrefixInputs)("NGN prefix — normalizes %s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  // ─── Non-Nigerian E.164 numbers should pass through unchanged ───────────────
  it("passes through a valid non-Nigerian E.164 number", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });

  // ─── Invalid inputs must return null ────────────────────────────────────────
  const invalidInputs = [
    "",
    "0",
    "123",
    "notaphone",
    "00000000000", // all zeros
    "+0123456789", // leading zero after +
    "080123456", // too short (9 digits after 0)
    "080123456789", // too long (12 digits after 0)
    "12345678901234567", // 17 digits — exceeds E.164 max
  ];

  test.each(invalidInputs)("returns null for invalid input %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  // ─── Zod schema integration ──────────────────────────────────────────────────
  it("verifyOtpSchema normalizes phone to E.164", async () => {
    const { verifyOtpSchema } = await import("@/types/schemas");
    const result = verifyOtpSchema.safeParse({ phone: "08012345678", otp: "123456" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe(canonical);
  });

  it("verifyOtpSchema rejects an invalid phone", async () => {
    const { verifyOtpSchema } = await import("@/types/schemas");
    const result = verifyOtpSchema.safeParse({ phone: "123", otp: "123456" });
    expect(result.success).toBe(false);
  });

  it("createGiftSchema normalizes recipientPhone to E.164", async () => {
    const { createGiftSchema } = await import("@/types/schemas");
    const result = createGiftSchema.safeParse({
      recipientPhone: "08012345678",
      recipientName: "Ada Obi",
      amountNgn: 1000,
      unlockAt: new Date(Date.now() + 86_400_000).toISOString(),
      paymentProvider: "paystack",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.recipientPhone).toBe(canonical);
  });
});

describe("hashPhone", () => {
  const phone = "+2348012345678";

  describe("without PHONE_HASH_SECRET (plain SHA-256 fallback)", () => {
    it("returns a 64-char hex string", () => {
      expect(hashPhone(phone)).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic", () => {
      expect(hashPhone(phone)).toBe(hashPhone(phone));
    });

    it("produces different hashes for different numbers", () => {
      expect(hashPhone(phone)).not.toBe(hashPhone("+2349012345678"));
    });
  });

  describe("with PHONE_HASH_SECRET (HMAC-SHA256)", () => {
    const SECRET = "a".repeat(32);

    beforeEach(() => {
      process.env.PHONE_HASH_SECRET = SECRET;
    });
    afterEach(() => {
      delete process.env.PHONE_HASH_SECRET;
    });

    it("returns a 64-char hex string", () => {
      expect(hashPhone(phone)).toMatch(/^[0-9a-f]{64}$/);
    });

    it("same phone + same secret produces the same hash", () => {
      expect(hashPhone(phone)).toBe(hashPhone(phone));
    });

    it("different secret produces a different hash", () => {
      const h1 = hashPhone(phone); // uses SECRET
      process.env.PHONE_HASH_SECRET = "b".repeat(32);
      const h2 = hashPhone(phone);
      expect(h1).not.toBe(h2);
    });

    it("HMAC hash differs from plain SHA-256 hash for the same input", () => {
      const hmacHash = hashPhone(phone);
      delete process.env.PHONE_HASH_SECRET;
      const sha256Hash = hashPhone(phone);
      expect(hmacHash).not.toBe(sha256Hash);
    });
  });
});

describe("detectPhoneHashCollision", () => {
  function makeDb(count: number) {
    return {
      query: jest.fn().mockResolvedValue({ rows: [{ count: String(count) }] }),
    };
  }

  it("returns true when exactly one user matches", async () => {
    const db = makeDb(1);
    await expect(detectPhoneHashCollision("abc123", db)).resolves.toBe(true);
  });

  it("returns false when zero users match (unregistered)", async () => {
    const db = makeDb(0);
    await expect(detectPhoneHashCollision("abc123", db)).resolves.toBe(false);
  });

  it("throws PHONE_HASH_COLLISION when multiple users share the hash", async () => {
    const db = makeDb(2);
    await expect(detectPhoneHashCollision("abc123", db)).rejects.toThrow(
      "PHONE_HASH_COLLISION"
    );
  });

  it("passes the hash as a parameterised query arg", async () => {
    const db = makeDb(1);
    await detectPhoneHashCollision("deadbeef", db);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ["deadbeef"]);
  });
});
