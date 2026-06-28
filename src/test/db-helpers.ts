/**
 * src/test/db-helpers.ts
 *
 * Test database seeding and teardown utilities for integration tests.
 * Uses TEST_DATABASE_URL (separate from development DB).
 *
 * Usage in a test suite:
 *   import { setupTestDb, teardownTestDb, seedTestData, cleanTestData } from "@/test/db-helpers";
 *
 *   beforeAll(async () => { await setupTestDb(); await seedTestData(); });
 *   afterAll(async () => { await teardownTestDb(); });
 *   afterEach(async () => { await cleanTestData(); });
 *
 * Closes #393
 */
import { Pool, PoolClient } from "pg";
import { createHash } from "crypto";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://lumigift:lumigift@localhost:5432/lumigift_test";

let pool: Pool | null = null;

export function getTestPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: TEST_DB_URL, max: 5 });
  }
  return pool;
}

function hashPhone(phone: string): string {
  return createHash("sha256").update(phone).digest("hex");
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    stellar_public_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS gifts (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    recipient_phone_hash TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    amount_ngn NUMERIC NOT NULL,
    amount_usdc TEXT NOT NULL,
    message TEXT,
    voice_note_url TEXT,
    media_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    unlock_at TIMESTAMPTZ NOT NULL,
    stellar_tx_hash TEXT,
    claim_tx_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS gift_invitations (
    id TEXT PRIMARY KEY,
    gift_id TEXT NOT NULL,
    recipient_phone_hash TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    user_id TEXT,
    gift_id TEXT,
    amount_ngn INTEGER,
    amount_usdc TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending',
    ip_address INET,
    metadata JSONB
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

// ─── Seed data ────────────────────────────────────────────────────────────────

export const TEST_USERS = [
  { id: "test-user-1", phone: "+2348011111111", display_name: "Alice Obi" },
  { id: "test-user-2", phone: "+2348022222222", display_name: "Bob Eze" },
  { id: "test-user-3", phone: "+2348033333333", display_name: "Carol Nwosu" },
] as const;

const now = new Date();
const past = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const future = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

export const TEST_GIFTS = [
  {
    id: "test-gift-1",
    sender_id: "test-user-1",
    recipient_phone_hash: hashPhone("+2348022222222"),
    recipient_name: "Bob Eze",
    amount_ngn: 5000,
    amount_usdc: "3.0000000",
    status: "locked",
    unlock_at: future(7),
  },
  {
    id: "test-gift-2",
    sender_id: "test-user-1",
    recipient_phone_hash: hashPhone("+2348033333333"),
    recipient_name: "Carol Nwosu",
    amount_ngn: 10000,
    amount_usdc: "6.0000000",
    status: "unlocked",
    unlock_at: past(1),
  },
  {
    id: "test-gift-3",
    sender_id: "test-user-2",
    recipient_phone_hash: hashPhone("+2348011111111"),
    recipient_name: "Alice Obi",
    amount_ngn: 2500,
    amount_usdc: "1.5000000",
    status: "claimed",
    unlock_at: past(3),
    claim_tx_hash: "claimtxhash0000000000000000000000000000000000000000000000000001",
  },
] as const;

// ─── Lifecycle helpers ────────────────────────────────────────────────────────

/** Creates schema tables (idempotent). Call once in beforeAll. */
export async function setupTestDb(): Promise<void> {
  const db = getTestPool();
  await db.query(SCHEMA_SQL);
}

/** Closes the pool. Call once in afterAll. */
export async function teardownTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Seeds base test data. Call in beforeAll or beforeEach as needed. */
export async function seedTestData(): Promise<void> {
  const db = getTestPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const u of TEST_USERS) {
      await client.query(
        `INSERT INTO users (id, phone, display_name) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, display_name = EXCLUDED.display_name`,
        [u.id, u.phone, u.display_name]
      );
    }

    for (const g of TEST_GIFTS) {
      await client.query(
        `INSERT INTO gifts
           (id, sender_id, recipient_phone_hash, recipient_name, amount_ngn, amount_usdc, status, unlock_at, claim_tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           claim_tx_hash = EXCLUDED.claim_tx_hash,
           updated_at = NOW()`,
        [
          g.id,
          g.sender_id,
          g.recipient_phone_hash,
          g.recipient_name,
          g.amount_ngn,
          g.amount_usdc,
          g.status,
          g.unlock_at,
          (g as { claim_tx_hash?: string }).claim_tx_hash ?? null,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Removes all test data from tables. Call in afterEach to ensure test isolation.
 * Truncates in dependency order to avoid FK violations.
 */
export async function cleanTestData(): Promise<void> {
  const db = getTestPool();
  await db.query(
    "TRUNCATE notifications, data_deletion_requests, audit_logs, gift_invitations, gifts, users RESTART IDENTITY CASCADE"
  );
}

/**
 * Runs a callback inside a transaction that is always rolled back.
 * Useful for tests that need to verify DB state without persisting changes.
 */
export async function withRollback(
  fn: (client: PoolClient) => Promise<void>
): Promise<void> {
  const db = getTestPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}
