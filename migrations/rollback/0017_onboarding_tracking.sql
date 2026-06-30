-- Rollback: 0008_onboarding_tracking.sql
ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed_at;
