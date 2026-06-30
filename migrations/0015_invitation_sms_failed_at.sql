-- Migration: add sms_failed_at column to gift_invitations
-- Issue #580: Track when all SMS retry attempts have been exhausted so ops
-- can identify and manually re-trigger failed invitations.

ALTER TABLE gift_invitations
  ADD COLUMN IF NOT EXISTS sms_failed_at TIMESTAMPTZ;

COMMENT ON COLUMN gift_invitations.sms_failed_at IS
  'Timestamp set when all BullMQ SMS retry attempts are exhausted (3 attempts with exponential backoff). NULL means SMS has not permanently failed.';

CREATE INDEX IF NOT EXISTS idx_gift_invitations_sms_failed_at
  ON gift_invitations(sms_failed_at)
  WHERE sms_failed_at IS NOT NULL;
