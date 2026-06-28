/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Initial schema migration.
 * Captures the base tables that existed before the incremental migrations
 * in migrations/ were introduced.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT        PRIMARY KEY,
      phone        TEXT        NOT NULL UNIQUE,
      display_name TEXT        NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gifts (
      id                   TEXT        PRIMARY KEY,
      sender_id            TEXT        NOT NULL,
      recipient_phone_hash TEXT        NOT NULL,
      recipient_name       TEXT        NOT NULL,
      amount_ngn           NUMERIC     NOT NULL,
      amount_usdc          TEXT        NOT NULL,
      status               TEXT        NOT NULL DEFAULT 'pending_payment',
      unlock_at            TIMESTAMPTZ NOT NULL,
      stellar_tx_hash      TEXT,
      claim_tx_hash        TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS paystack_processed_refs (
      reference    TEXT        PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gift_invitations (
      id                   TEXT        PRIMARY KEY,
      gift_id              TEXT        NOT NULL,
      recipient_phone_hash TEXT        NOT NULL,
      recipient_phone      TEXT        NOT NULL,
      token                TEXT        NOT NULL UNIQUE,
      status               TEXT        NOT NULL DEFAULT 'pending',
      expires_at           TIMESTAMPTZ NOT NULL,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_gift_invitations_gift_id
        FOREIGN KEY (gift_id) REFERENCES gifts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_gift_invitations_token ON gift_invitations(token);
    CREATE INDEX IF NOT EXISTS idx_gift_invitations_gift_id ON gift_invitations(gift_id);
    CREATE INDEX IF NOT EXISTS idx_gift_invitations_recipient_phone_hash ON gift_invitations(recipient_phone_hash);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS gift_invitations;
    DROP TABLE IF EXISTS paystack_processed_refs;
    DROP TABLE IF EXISTS gifts;
    DROP TABLE IF EXISTS users;
  `);
};
