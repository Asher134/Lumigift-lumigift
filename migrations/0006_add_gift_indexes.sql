-- Migration: add indexes on frequently queried gifts columns
-- Issue #339: Improve query performance for recipient lookups, sender dashboards,
--             status filters, and cron unlock/expiry jobs.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gifts_recipient_phone_hash
  ON gifts (recipient_phone_hash);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gifts_sender_id
  ON gifts (sender_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gifts_status
  ON gifts (status);

-- Composite index for cron queries:
--   WHERE status = 'locked'   AND unlock_at <= now   (processUnlocks)
--   WHERE status = 'unlocked' AND unlock_at <= cutoff (processExpiries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gifts_status_unlock_at
  ON gifts (status, unlock_at);
