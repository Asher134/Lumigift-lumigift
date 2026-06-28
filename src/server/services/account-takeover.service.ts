import pool from "@/lib/db";
import { getCountryFromIp } from "@/lib/device";
import { sendNewDeviceAlert } from "@/lib/sms";
import { serviceLogger } from "@/lib/logger";
import { serverConfig } from "@/server/config";

const log = serviceLogger("account-takeover");

export async function checkAccountTakeover(
  userId: string,
  phone: string,
  ip: string,
  lastLoginCountry: string | null
): Promise<{ suspicious: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  // Check 1: Login from new country
  const currentCountry = await getCountryFromIp(ip);
  if (lastLoginCountry && currentCountry !== lastLoginCountry) {
    reasons.push(`Login from new country: ${currentCountry}`);
    const reportUrl = `${serverConfig.app.url}/api/v1/auth/report-login?uid=${userId}`;
    sendNewDeviceAlert(phone, {
      time: new Date().toUTCString(),
      country: currentCountry,
      reportUrl,
    }).catch((e) => log.error({ e }, "Failed to send alert"));
  }

  // Check 2: Account suspension status
  const { rows } = await pool.query("SELECT account_status FROM users WHERE id = $1", [userId]);
  if (rows[0]?.account_status === "suspended") {
    reasons.push("Account suspended");
  }

  // Update last login country
  await pool.query(
    "UPDATE users SET last_login_country = $1, last_login_at = NOW() WHERE id = $2",
    [currentCountry, userId]
  );

  return { suspicious: reasons.length > 0, reasons };
}

export async function trackFailedOtp(phone: string): Promise<number> {
  await pool.query("INSERT INTO failed_otp_attempts (phone) VALUES ($1)", [phone]);

  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM failed_otp_attempts 
     WHERE phone = $1 AND attempted_at > NOW() - INTERVAL '24 hours'`,
    [phone]
  );

  const count = parseInt(rows[0].count);

  // Flag account after 3+ failed OTPs
  if (count >= 3) {
    const { rows: userRows } = await pool.query("SELECT id FROM users WHERE phone = $1", [phone]);
    if (userRows[0]) {
      await pool.query("UPDATE users SET account_status = $1 WHERE id = $2", [
        "flagged",
        userRows[0].id,
      ]);
      await pool.query(
        "INSERT INTO account_alerts (user_id, alert_type, description) VALUES ($1, $2, $3)",
        [userRows[0].id, "failed_otp", `${count} failed OTP attempts detected`]
      );
    }
  }

  return count;
}

export async function checkRapidGiftCreation(userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM gifts 
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId]
  );

  const count = parseInt(rows[0].count);
  if (count > 10) {
    await pool.query("UPDATE users SET account_status = $1 WHERE id = $2", ["flagged", userId]);
    await pool.query(
      "INSERT INTO account_alerts (user_id, alert_type, description) VALUES ($1, $2, $3)",
      [userId, "rapid_gifts", `${count} gifts created within 1 hour`]
    );
    return true;
  }

  return false;
}
