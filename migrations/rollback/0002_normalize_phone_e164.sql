-- Rollback: 0002_normalize_phone_e164.sql
-- Note: phone data normalisation cannot be fully reversed without original data.
-- This removes the normalisation constraint only.
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
