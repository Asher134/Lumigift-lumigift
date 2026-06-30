-- Migration: GDPR/NDPR data deletion requests
-- Issue #407: Implement GDPR/NDPR data deletion endpoint for user accounts

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  ip_address INET,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_user_id ON data_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_status ON data_deletion_requests(status);

COMMENT ON TABLE data_deletion_requests IS 'NDPR/GDPR compliance: log of user data deletion requests. Retained for 7 years.';

-- Data retention note: financial records (audit_logs, gifts with tx hashes) are
-- retained for regulatory compliance even after user deletion. Only PII is removed.
