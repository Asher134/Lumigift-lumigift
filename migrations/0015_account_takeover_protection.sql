-- Issue #411: Account takeover protection
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_country TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'flagged'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Track failed OTPs per user
CREATE TABLE IF NOT EXISTS failed_otp_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_failed_otp_attempts_phone_time ON failed_otp_attempts(phone, attempted_at DESC);

-- Account takeover alerts
CREATE TABLE IF NOT EXISTS account_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  description TEXT,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_alerts_user_id ON account_alerts(user_id);
