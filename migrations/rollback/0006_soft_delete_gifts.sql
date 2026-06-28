-- Rollback: 0006_soft_delete_gifts.sql
ALTER TABLE gifts DROP COLUMN IF EXISTS deleted_at;
