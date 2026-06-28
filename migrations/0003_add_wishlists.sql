-- Migration: recipient wishlist feature
-- Issue #412: Allow users to create wishlists of desired gift amounts

CREATE TABLE IF NOT EXISTS wishlists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  is_public   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id  UUID        NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  amount_ngn   INTEGER     NOT NULL CHECK (amount_ngn > 0),
  label        TEXT,
  fulfilled    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist ON wishlist_items (wishlist_id);
