-- Migration: group gift funding (#418)
-- Allows multiple contributors to pool funds for a single gift.

CREATE TABLE IF NOT EXISTS group_gifts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          TEXT NOT NULL,
  recipient_phone     TEXT NOT NULL,
  recipient_name      TEXT NOT NULL,
  target_amount_ngn   NUMERIC(14, 2) NOT NULL,
  collected_amount_ngn NUMERIC(14, 2) NOT NULL DEFAULT 0,
  message             TEXT,
  unlock_at           TIMESTAMPTZ NOT NULL,
  deadline            TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','funded','locked','expired','cancelled')),
  share_token         TEXT NOT NULL UNIQUE,
  contract_id         TEXT,
  stellar_tx_hash     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_contributions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_gift_id       UUID NOT NULL REFERENCES group_gifts(id) ON DELETE CASCADE,
  contributor_name    TEXT NOT NULL,
  contributor_phone   TEXT,
  amount_ngn          NUMERIC(14, 2) NOT NULL,
  payment_reference   TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','success','failed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_contributions_gift_id
  ON group_contributions(group_gift_id);
