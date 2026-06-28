import pool from "../src/lib/db";
import { normalizePhone } from "../src/lib/phone";

async function migrate() {
  console.log("Starting phone number normalization migration...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Migrate users table
    const { rows: users } = await client.query("SELECT id, phone FROM users");
    console.log(`Found ${users.length} users to check.`);

    for (const user of users) {
      const normalized = normalizePhone(user.phone);
      if (normalized && normalized !== user.phone) {
        console.log(`Normalizing user ${user.id}: ${user.phone} -> ${normalized}`);
        
        // Check if normalized number already exists to avoid unique constraint violation
        const { rows: conflicts } = await client.query(
          "SELECT id FROM users WHERE phone = $1 AND id != $2",
          [normalized, user.id]
        );

        if (conflicts.length > 0) {
          console.warn(`Conflict detected for user ${user.id}. ${normalized} already exists for user ${conflicts[0].id}. Skipping.`);
          continue;
        }

        await client.query("UPDATE users SET phone = $1 WHERE id = $2", [normalized, user.id]);
      }
    }

    // 2. Migrate gift_invitations table
    const { rows: invitations } = await client.query("SELECT id, recipient_phone FROM gift_invitations");
    console.log(`Found ${invitations.length} gift invitations to check.`);

    for (const invitation of invitations) {
      const normalized = normalizePhone(invitation.recipient_phone);
      if (normalized && normalized !== invitation.recipient_phone) {
        console.log(`Normalizing invitation ${invitation.id}: ${invitation.recipient_phone} -> ${normalized}`);
        await client.query("UPDATE gift_invitations SET recipient_phone = $1 WHERE id = $2", [normalized, invitation.id]);
      }
    }

    await client.query("COMMIT");
    console.log("Migration completed successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
