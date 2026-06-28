-- Rollback: 0007_occasion_and_scheduling.sql
DROP INDEX IF EXISTS idx_gifts_notify_at;
ALTER TABLE gifts DROP COLUMN IF EXISTS notify_at;
ALTER TABLE gifts DROP COLUMN IF EXISTS occasion;
