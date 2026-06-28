-- Rollback: 0001_add_stellar_tx_hash.sql
ALTER TABLE gifts DROP COLUMN IF EXISTS stellar_tx_hash;
