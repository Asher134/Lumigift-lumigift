-- Migration: create audit log for gift claims
-- Issue #341: Record every claim attempt for compliance and fraud detection

CREATE TABLE IF NOT EXISTS claim_audit_log (
  id            SERIAL PRIMARY KEY,
  gift_id       UUID NOT NULL,
  ip_address    TEXT,
  user_agent    TEXT,
  outcome       TEXT NOT NULL, -- 'success', 'failed:not_unlocked', 'failed:error', etc.
  error_message TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_audit_log_gift_id ON claim_audit_log (gift_id);
CREATE INDEX IF NOT EXISTS idx_claim_audit_log_timestamp ON claim_audit_log (timestamp);

COMMENT ON TABLE claim_audit_log IS 'Records every claim attempt (successful and failed) for compliance and fraud detection.';
