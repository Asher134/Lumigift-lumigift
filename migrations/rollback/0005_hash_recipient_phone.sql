-- Rollback: 0003_hash_recipient_phone.sql
-- WARNING: plaintext phone data is permanently lost after this migration.
-- This only restores the column structure.
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE gifts DROP COLUMN IF EXISTS recipient_phone_hash;
