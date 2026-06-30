-- Migration: add composite index on gifts(sender_id, created_at) for daily spend limit query
-- Issue #582: The DB-level daily spend limit check queries:
--   SELECT SUM(amount_ngn) FROM gifts
--    WHERE sender_id = $1 AND created_at >= NOW() - INTERVAL '1 day'
-- This index makes that an efficient range scan instead of a full table scan.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gifts_sender_id_created_at
  ON gifts (sender_id, created_at DESC);

COMMENT ON INDEX idx_gifts_sender_id_created_at IS
  'Supports the DB-level daily spend limit aggregate: WHERE sender_id=? AND created_at >= NOW()-1day';
