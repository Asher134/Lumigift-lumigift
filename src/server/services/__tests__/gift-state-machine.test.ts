import { isValidTransition, assertValidTransition } from "../gift-state-machine";
import type { GiftStatus } from "@/types";

const ALL_STATUSES: GiftStatus[] = [
  "draft",
  "pending_payment",
  "funded",
  "locked",
  "unlocked",
  "claimed",
  "expired",
  "cancelled",
];

// Explicitly enumerate every allowed transition.
const VALID_TRANSITIONS = new Set<string>([
  "draft->pending_payment",
  "draft->cancelled",
  "pending_payment->funded",
  "pending_payment->cancelled",
  "funded->locked",
  "funded->cancelled",
  "locked->unlocked",
  "locked->cancelled",
  "unlocked->claimed",
  "unlocked->cancelled",
]);

function key(from: GiftStatus, to: GiftStatus) {
  return `${from}->${to}`;
}

describe("gift-state-machine", () => {
  describe("isValidTransition — full 8×8 matrix", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const expected = VALID_TRANSITIONS.has(key(from, to));
        it(`${from} → ${to} should be ${expected ? "valid" : "invalid"}`, () => {
          expect(isValidTransition(from, to)).toBe(expected);
        });
      }
    }
  });

  describe("valid transitions return true", () => {
    const validPaths: [GiftStatus, GiftStatus][] = [
      ["draft", "pending_payment"],
      ["draft", "cancelled"],
      ["pending_payment", "funded"],
      ["pending_payment", "cancelled"],
      ["funded", "locked"],
      ["funded", "cancelled"],
      ["locked", "unlocked"],
      ["locked", "cancelled"],
      ["unlocked", "claimed"],
      ["unlocked", "cancelled"],
    ];

    test.each(validPaths)("%s → %s is valid", (from, to) => {
      expect(isValidTransition(from, to)).toBe(true);
    });
  });

  describe("invalid transitions — terminal states cannot transition", () => {
    const terminalStatuses: GiftStatus[] = ["claimed", "expired", "cancelled"];

    for (const terminal of terminalStatuses) {
      for (const to of ALL_STATUSES) {
        it(`${terminal} → ${to} is invalid (terminal)`, () => {
          expect(isValidTransition(terminal, to)).toBe(false);
        });
      }
    }
  });

  describe("invalid transitions — skipping steps", () => {
    const skipPaths: [GiftStatus, GiftStatus][] = [
      ["pending_payment", "locked"],   // skips funded
      ["pending_payment", "unlocked"], // skips multiple
      ["pending_payment", "claimed"],  // skips multiple
      ["funded", "unlocked"],          // skips locked
      ["funded", "claimed"],           // skips multiple
      ["locked", "claimed"],           // skips unlocked
      ["draft", "funded"],             // skips pending_payment
      ["draft", "locked"],             // skips multiple
      ["draft", "unlocked"],           // skips multiple
      ["draft", "claimed"],            // skips multiple
    ];

    test.each(skipPaths)("%s → %s is invalid (skipped step)", (from, to) => {
      expect(isValidTransition(from, to)).toBe(false);
    });
  });

  describe("invalid transitions — backwards", () => {
    const backwardPaths: [GiftStatus, GiftStatus][] = [
      ["funded", "pending_payment"],
      ["funded", "draft"],
      ["locked", "funded"],
      ["locked", "pending_payment"],
      ["unlocked", "locked"],
      ["unlocked", "funded"],
      ["unlocked", "pending_payment"],
      ["claimed", "unlocked"],
      ["claimed", "locked"],
      ["claimed", "funded"],
      ["claimed", "pending_payment"],
    ];

    test.each(backwardPaths)("%s → %s is invalid (backwards)", (from, to) => {
      expect(isValidTransition(from, to)).toBe(false);
    });
  });

  describe("invalid transitions — expired status", () => {
    for (const to of ALL_STATUSES) {
      it(`expired → ${to} is invalid`, () => {
        expect(isValidTransition("expired", to)).toBe(false);
      });
    }

    for (const from of ALL_STATUSES.filter((s) => s !== "locked" && s !== "unlocked")) {
      it(`${from} → expired is invalid`, () => {
        expect(isValidTransition(from, "expired")).toBe(false);
      });
    }
  });

  describe("assertValidTransition", () => {
    it("does not throw for a valid transition", () => {
      expect(() => assertValidTransition("pending_payment", "funded")).not.toThrow();
      expect(() => assertValidTransition("funded", "locked")).not.toThrow();
      expect(() => assertValidTransition("locked", "unlocked")).not.toThrow();
      expect(() => assertValidTransition("unlocked", "claimed")).not.toThrow();
      expect(() => assertValidTransition("locked", "cancelled")).not.toThrow();
      expect(() => assertValidTransition("draft", "pending_payment")).not.toThrow();
    });

    it("throws Error for an invalid transition", () => {
      expect(() => assertValidTransition("claimed", "pending_payment")).toThrow(Error);
      expect(() => assertValidTransition("cancelled", "locked")).toThrow(Error);
      expect(() => assertValidTransition("expired", "claimed")).toThrow(Error);
    });

    it("throws with a descriptive message including both statuses", () => {
      expect(() => assertValidTransition("cancelled", "locked")).toThrow(
        'Invalid gift status transition: "cancelled" → "locked"'
      );
      expect(() => assertValidTransition("claimed", "unlocked")).toThrow(
        'Invalid gift status transition: "claimed" → "unlocked"'
      );
      expect(() => assertValidTransition("expired", "funded")).toThrow(
        'Invalid gift status transition: "expired" → "funded"'
      );
    });

    it("throws for every terminal → non-terminal combination", () => {
      const terminals: GiftStatus[] = ["claimed", "expired", "cancelled"];
      const nonTerminals: GiftStatus[] = ["draft", "pending_payment", "funded", "locked", "unlocked"];

      for (const terminal of terminals) {
        for (const to of nonTerminals) {
          expect(() => assertValidTransition(terminal, to)).toThrow(
            `Invalid gift status transition: "${terminal}" → "${to}"`
          );
        }
      }
    });
  });
});
