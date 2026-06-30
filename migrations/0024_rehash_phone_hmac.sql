-- Migration: re-hash recipient_phone_hash with HMAC-SHA256 + pepper
-- Issue #669: Plain SHA-256 hashes are vulnerable to rainbow-table attacks on
-- the ~10-digit Nigerian phone-number space. This migration replaces every
-- existing SHA-256 digest with an HMAC-SHA256 digest keyed by PHONE_HASH_SECRET.
--
-- Prerequisites:
--   1. PHONE_HASH_SECRET must be set in the runtime environment (≥ 32 chars).
--   2. Run this migration AFTER deploying the updated application code so that
--      new writes already use HMAC-SHA256.  Running it before would leave a
--      window where new hashes (HMAC) don't match old reads (SHA-256).
--
-- Run manually:
--   psql "$DATABASE_URL" \
--     -v phone_hash_secret="$PHONE_HASH_SECRET" \
--     -f migrations/0013_rehash_phone_hmac.sql
--
-- The pgcrypto extension (already enabled by 0003) is required.

-- Re-hash gifts.recipient_phone_hash
-- We cannot reconstruct the original phone number from the existing SHA-256
-- hash, so this migration re-hashes the plaintext column on users (phone) and
-- the gifts join via users.  For gifts where we only stored the hash (no
-- plaintext), the hash is left as-is — those records will naturally be
-- updated the next time the recipient authenticates.

-- 1. Add a temporary HMAC column to gifts to stage the new values safely.
ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS recipient_phone_hash_hmac TEXT;

-- 2. Backfill: join gifts → users to get the phone plaintext, then re-hash.
--    Rows where the join finds no matching user (e.g., the user was deleted)
--    are left NULL and will be cleaned up in step 4.
UPDATE gifts g
SET recipient_phone_hash_hmac = encode(
      hmac(u.phone, :phone_hash_secret, 'sha256'),
      'hex'
    )
FROM users u
WHERE u.phone_hash = g.recipient_phone_hash;

-- 3. For any gifts that could not be re-hashed (no matching user), keep the
--    old SHA-256 value so lookups still work until the recipient re-logs in.
UPDATE gifts
SET recipient_phone_hash_hmac = recipient_phone_hash
WHERE recipient_phone_hash_hmac IS NULL;

-- 4. Swap the columns atomically.
UPDATE gifts
SET recipient_phone_hash = recipient_phone_hash_hmac;

ALTER TABLE gifts
  DROP COLUMN recipient_phone_hash_hmac;

-- 5. Re-hash users.phone_hash (the authoritative hash for login lookups).
UPDATE users
SET phone_hash = encode(hmac(phone, :phone_hash_secret, 'sha256'), 'hex')
WHERE phone IS NOT NULL;

-- 6. Update the column comment to document the new algorithm.
COMMENT ON COLUMN gifts.recipient_phone_hash IS
  'HMAC-SHA256 (pepper: PHONE_HASH_SECRET) hex digest of the E.164 recipient phone number';

COMMENT ON COLUMN users.phone_hash IS
  'HMAC-SHA256 (pepper: PHONE_HASH_SECRET) hex digest of the E.164 phone number';
