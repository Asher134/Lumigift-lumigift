-- Migration: create failed_jobs table for BullMQ dead letter handling
-- Issue #590: Persist failed Stellar tx jobs for inspection and replay.

CREATE TABLE IF NOT EXISTS failed_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name    TEXT        NOT NULL,
  job_id        TEXT        NOT NULL,
  job_name      TEXT        NOT NULL,
  job_data      JSONB       NOT NULL,
  error_message TEXT        NOT NULL,
  attempts_made INTEGER     NOT NULL DEFAULT 0,
  failed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  replayed_at   TIMESTAMPTZ,

  CONSTRAINT uq_failed_jobs_job_id UNIQUE (queue_name, job_id)
);

CREATE INDEX IF NOT EXISTS idx_failed_jobs_queue_name ON failed_jobs (queue_name);
CREATE INDEX IF NOT EXISTS idx_failed_jobs_failed_at  ON failed_jobs (failed_at DESC);
