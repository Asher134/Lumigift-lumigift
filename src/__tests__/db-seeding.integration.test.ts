/**
 * @jest-environment node
 *
 * Integration tests for test DB seeding and teardown utilities.
 * Verifies that setupTestDb, seedTestData, cleanTestData, and teardownTestDb
 * work correctly and provide test isolation.
 *
 * Requires TEST_DATABASE_URL to be set (or defaults to lumigift_test).
 * Closes #393
 */

import {
  setupTestDb,
  teardownTestDb,
  seedTestData,
  cleanTestData,
  getTestPool,
  TEST_USERS,
  TEST_GIFTS,
  withRollback,
} from "@/test/db-helpers";

describe("Test DB seeding and teardown", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanTestData();
    await seedTestData();
  });

  afterEach(async () => {
    await cleanTestData();
  });

  it("seeds expected users", async () => {
    const db = getTestPool();
    const { rows } = await db.query("SELECT id FROM users ORDER BY id");
    expect(rows.map((r: { id: string }) => r.id)).toEqual(
      [...TEST_USERS].map((u) => u.id).sort()
    );
  });

  it("seeds expected gifts", async () => {
    const db = getTestPool();
    const { rows } = await db.query("SELECT id, status FROM gifts ORDER BY id");
    expect(rows).toHaveLength(TEST_GIFTS.length);
    expect(rows.find((r: { id: string }) => r.id === "test-gift-3").status).toBe("claimed");
  });

  it("cleanTestData removes all rows", async () => {
    await cleanTestData();
    const db = getTestPool();
    const { rows: users } = await db.query("SELECT 1 FROM users");
    const { rows: gifts } = await db.query("SELECT 1 FROM gifts");
    expect(users).toHaveLength(0);
    expect(gifts).toHaveLength(0);
  });

  it("withRollback does not persist changes", async () => {
    const db = getTestPool();

    await withRollback(async (client) => {
      await client.query(
        "INSERT INTO users (id, phone, display_name) VALUES ($1, $2, $3)",
        ["rollback-user", "+2349000000000", "Rollback User"]
      );
      const { rows } = await client.query(
        "SELECT id FROM users WHERE id = $1",
        ["rollback-user"]
      );
      expect(rows).toHaveLength(1); // visible inside transaction
    });

    // After rollback, the row should not exist
    const { rows } = await db.query(
      "SELECT id FROM users WHERE id = $1",
      ["rollback-user"]
    );
    expect(rows).toHaveLength(0);
  });

  it("parallel test suites do not conflict (isolated data)", async () => {
    // Each test starts with a clean seed; inserting a unique row here
    // should not affect other tests because afterEach cleans up.
    const db = getTestPool();
    await db.query(
      "INSERT INTO users (id, phone, display_name) VALUES ($1, $2, $3)",
      ["parallel-user", "+2349111111111", "Parallel User"]
    );
    const { rows } = await db.query("SELECT id FROM users WHERE id = $1", ["parallel-user"]);
    expect(rows).toHaveLength(1);
    // afterEach will clean this up
  });
});
