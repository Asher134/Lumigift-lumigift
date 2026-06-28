/**
 * Rollback the last N applied migrations.
 * Usage: ts-node scripts/rollback-migration.ts [count=1]
 *
 * Each migration must have a corresponding rollback file at
 * migrations/rollback/<migration-name>.sql
 */
import { Client } from "pg";
import fs from "fs";
import path from "path";
import { serverConfig } from "../src/server/config";

async function rollback(count = 1) {
  const client = new Client({ connectionString: serverConfig.database.url });
  await client.connect();

  try {
    const { rows } = await client.query(
      "SELECT name FROM _migrations ORDER BY executed_at DESC LIMIT $1",
      [count]
    );

    if (rows.length === 0) {
      console.log("No migrations to roll back.");
      return;
    }

    for (const { name } of rows) {
      const rollbackFile = path.join(__dirname, "../migrations/rollback", name);
      if (!fs.existsSync(rollbackFile)) {
        console.error(`Rollback script not found: ${rollbackFile}`);
        process.exit(1);
      }

      const sql = fs.readFileSync(rollbackFile, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("DELETE FROM _migrations WHERE name = $1", [name]);
        await client.query("COMMIT");
        console.log(`Rolled back: ${name}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`Rollback failed for ${name}:`, err);
        process.exit(1);
      }
    }
  } finally {
    await client.end();
  }
}

const count = parseInt(process.argv[2] ?? "1", 10);
rollback(count);
