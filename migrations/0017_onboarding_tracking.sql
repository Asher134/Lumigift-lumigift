-- Migration: track onboarding completion per user
-- Issue #421: Onboarding shown only to new users; completion persisted server-side

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN users.onboarding_completed_at IS 'NULL = onboarding not yet completed; set to NOW() on first completion';
