/**
 * @jest-environment node
 *
 * Unit tests for src/server/services/fraud.service.ts
 *
 * Covers all fraud-rule branches at 100% branch coverage:
 *  - checkVelocity: below, at, above velocity limit
 *  - checkLargeAmount: below, at, above amount threshold
 *  - checkNewAccountLargeAmount: new+small, new+at-threshold, new+over, old+over
 *  - checkFraud (composite): each rule triggered independently + combinations
 */

import {
  checkVelocity,
  checkLargeAmount,
  checkNewAccountLargeAmount,
  checkFraud,
  VELOCITY_LIMIT,
  LARGE_AMOUNT_THRESHOLD_NGN,
  MIN_ACCOUNT_AGE_DAYS,
  NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN,
  type FraudCheckInput,
} from "../fraud.service";

// ─── checkVelocity ────────────────────────────────────────────────────────────

describe("checkVelocity", () => {
  it("allows sender below the velocity limit", () => {
    expect(checkVelocity(VELOCITY_LIMIT - 1)).toEqual({ blocked: false });
  });

  it("blocks sender exactly at the velocity limit (threshold)", () => {
    expect(checkVelocity(VELOCITY_LIMIT)).toEqual({
      blocked: true,
      reason: "velocity_limit_exceeded",
    });
  });

  it("blocks sender above the velocity limit", () => {
    expect(checkVelocity(VELOCITY_LIMIT + 5)).toEqual({
      blocked: true,
      reason: "velocity_limit_exceeded",
    });
  });

  it("allows sender with zero gifts in last 24 h", () => {
    expect(checkVelocity(0)).toEqual({ blocked: false });
  });
});

// ─── checkLargeAmount ────────────────────────────────────────────────────────

describe("checkLargeAmount", () => {
  it("allows amount exactly at the threshold (not over)", () => {
    expect(checkLargeAmount(LARGE_AMOUNT_THRESHOLD_NGN)).toEqual({ blocked: false });
  });

  it("blocks amount one naira over the threshold", () => {
    expect(checkLargeAmount(LARGE_AMOUNT_THRESHOLD_NGN + 1)).toEqual({
      blocked: true,
      reason: "single_large_amount",
    });
  });

  it("allows amount well below the threshold", () => {
    expect(checkLargeAmount(5_000)).toEqual({ blocked: false });
  });

  it("blocks amount well above the threshold", () => {
    expect(checkLargeAmount(500_000)).toEqual({
      blocked: true,
      reason: "single_large_amount",
    });
  });
});

// ─── checkNewAccountLargeAmount ──────────────────────────────────────────────

describe("checkNewAccountLargeAmount", () => {
  it("allows new account below the new-account threshold", () => {
    expect(
      checkNewAccountLargeAmount(MIN_ACCOUNT_AGE_DAYS - 1, NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN)
    ).toEqual({ blocked: false });
  });

  it("blocks new account one naira over the new-account threshold", () => {
    expect(
      checkNewAccountLargeAmount(
        MIN_ACCOUNT_AGE_DAYS - 1,
        NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN + 1
      )
    ).toEqual({ blocked: true, reason: "new_account_large_amount" });
  });

  it("allows established account even when amount exceeds new-account threshold", () => {
    expect(
      checkNewAccountLargeAmount(MIN_ACCOUNT_AGE_DAYS, NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN + 1)
    ).toEqual({ blocked: false });
  });

  it("allows established account well above new-account threshold", () => {
    expect(checkNewAccountLargeAmount(365, 100_000)).toEqual({ blocked: false });
  });

  it("blocks new account (age=0) with large amount", () => {
    expect(
      checkNewAccountLargeAmount(0, NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN + 1)
    ).toEqual({ blocked: true, reason: "new_account_large_amount" });
  });
});

// ─── checkFraud (composite) ───────────────────────────────────────────────────

describe("checkFraud", () => {
  const safeInput: FraudCheckInput = {
    senderId: "user-1",
    amountNgn: 5_000,
    giftsLast24h: 0,
    accountAgeDays: 365,
  };

  it("returns blocked:false when all rules pass", () => {
    expect(checkFraud(safeInput)).toEqual({ blocked: false });
  });

  it("triggers velocity rule and returns early without checking others", () => {
    const result = checkFraud({
      ...safeInput,
      giftsLast24h: VELOCITY_LIMIT,
    });
    expect(result).toEqual({ blocked: true, reason: "velocity_limit_exceeded" });
  });

  it("triggers large-amount rule when velocity passes", () => {
    const result = checkFraud({
      ...safeInput,
      giftsLast24h: 0,
      amountNgn: LARGE_AMOUNT_THRESHOLD_NGN + 1,
    });
    expect(result).toEqual({ blocked: true, reason: "single_large_amount" });
  });

  it("triggers new-account rule when velocity and large-amount pass", () => {
    const result = checkFraud({
      ...safeInput,
      giftsLast24h: 0,
      amountNgn: NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN + 1,
      accountAgeDays: MIN_ACCOUNT_AGE_DAYS - 1,
    });
    expect(result).toEqual({ blocked: true, reason: "new_account_large_amount" });
  });

  // ── Edge cases: exactly at thresholds ─────────────────────────────────────

  it("allows giftsLast24h one below the velocity limit", () => {
    expect(checkFraud({ ...safeInput, giftsLast24h: VELOCITY_LIMIT - 1 })).toEqual({
      blocked: false,
    });
  });

  it("allows amount exactly at LARGE_AMOUNT_THRESHOLD_NGN", () => {
    expect(checkFraud({ ...safeInput, amountNgn: LARGE_AMOUNT_THRESHOLD_NGN })).toEqual({
      blocked: false,
    });
  });

  it("allows new account at exactly NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN", () => {
    expect(
      checkFraud({
        ...safeInput,
        amountNgn: NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN,
        accountAgeDays: MIN_ACCOUNT_AGE_DAYS - 1,
      })
    ).toEqual({ blocked: false });
  });

  // ── Combination: multiple rules would trigger — first wins ────────────────

  it("velocity rule wins over large-amount when both would trigger", () => {
    const result = checkFraud({
      senderId: "user-1",
      amountNgn: LARGE_AMOUNT_THRESHOLD_NGN + 1,
      giftsLast24h: VELOCITY_LIMIT,
      accountAgeDays: 0,
    });
    expect(result.reason).toBe("velocity_limit_exceeded");
  });

  it("large-amount rule wins over new-account when velocity passes", () => {
    const result = checkFraud({
      senderId: "user-1",
      amountNgn: LARGE_AMOUNT_THRESHOLD_NGN + 1,
      giftsLast24h: 0,
      accountAgeDays: 0,
    });
    expect(result.reason).toBe("single_large_amount");
  });
});
