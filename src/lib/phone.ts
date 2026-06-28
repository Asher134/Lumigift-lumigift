import { createHash } from "crypto";
import type { PoolClient } from "pg";

/**
 * Returns the SHA-256 hex digest of an E.164 phone number.
 * Must match the hash stored in migrations/0003_hash_recipient_phone.sql.
 */
export function hashPhone(phone: string): string {
  return createHash("sha256").update(phone).digest("hex");
}

/**
 * Detects hash collisions before gift creation.
 *
 * A collision is defined as the same SHA-256 hash appearing for more than
 * one distinct normalized phone number in the users table.  Because SHA-256
 * collisions are cryptographically infeasible in practice, any such finding
 * indicates a data-integrity or normalization bug and must be reviewed
 * manually before the gift is accepted.
 *
 * @param phoneHash - The SHA-256 hex digest of the recipient's E.164 number.
 * @param db        - An active pg PoolClient (or Pool).
 * @returns `true` when the hash resolves to exactly one user (safe to proceed),
 *          `false` when zero users are found (unregistered recipient — caller
 *          decides whether to allow or block), and throws when multiple users
 *          share the hash (collision — gift must be rejected).
 */
export async function detectPhoneHashCollision(
  phoneHash: string,
  db: Pick<PoolClient, "query">
): Promise<boolean> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(DISTINCT id) AS count FROM users WHERE phone_hash = $1`,
    [phoneHash]
  );

  const count = parseInt(result.rows[0]?.count ?? "0", 10);

  if (count > 1) {
    // Collision: multiple users map to the same hash — reject and escalate.
    throw new Error(
      `PHONE_HASH_COLLISION: hash ${phoneHash.slice(0, 8)}… maps to ${count} users. ` +
        "Gift rejected pending manual review."
    );
  }

  return count === 1;
}

/**
 * Normalizes a phone number to E.164 format.
 * Supports Nigerian numbers in the following formats:
 *   - +2348012345678  (already E.164)
 *   - 2348012345678   (international without +)
 *   - 08012345678     (local with leading 0)
 *   - 8012345678      (local without leading 0)
 *
 * Non-Nigerian numbers that already start with `+` and have 10–15 digits are
 * passed through unchanged.
 *
 * @param raw - The raw phone number string in any supported format.
 * @returns The E.164-formatted phone number (e.g. `"+2348012345678"`),
 *   or `null` if the input cannot be normalized to a valid E.164 string.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  let e164: string;

  if (digits.startsWith("234") && digits.length === 13) {
    // 2348012345678 → +2348012345678
    e164 = `+${digits}`;
  } else if (digits.startsWith("0") && digits.length === 11) {
    // 08012345678 → +2348012345678
    e164 = `+234${digits.slice(1)}`;
  } else if (digits.length === 10 && !digits.startsWith("0")) {
    // 8012345678 → +2348012345678
    e164 = `+234${digits}`;
  } else if (raw.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    // Already E.164 for any country
    e164 = `+${digits}`;
  } else {
    return null;
  }

  // Final sanity check: E.164 is + followed by 10–15 digits, first digit non-zero
  if (!/^\+[1-9]\d{9,14}$/.test(e164)) return null;

  // For Nigerian numbers (+234...), the subscriber number must not be all zeros
  // and must start with a valid Nigerian network prefix (7, 8, or 9)
  if (e164.startsWith("+234")) {
    const subscriber = e164.slice(4); // 10 digits after +234
    if (subscriber.length !== 10) return null;
    if (!/^[789]/.test(subscriber)) return null;
  }

  return e164;
}
