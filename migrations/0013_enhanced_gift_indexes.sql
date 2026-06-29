-- Migration: add composite indexes for common gift query patterns
-- Issue #592: Reduce slow queries as gift data grows.

-- Composite index for sender dashboard queries sorted by creation date.
-- Covers: SELECT ... FROM gifts WHERE sender_id = $1 ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gifts_sender_id_created_at
  ON gifts (sender_id, created_at DESC);

-- Composite index for cursor-based pagination (issue #589).
-- Covers: SELECT ... FROM gifts WHERE sender_id = $1 AND id > $cursor ORDER BY id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gifts_sender_id_id
  ON gifts (sender_id, id);
