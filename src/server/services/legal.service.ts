import pool from "@/lib/db";

export async function getLatestLegalDocument(docType: "tos" | "privacy") {
  const { rows } = await pool.query(
    `SELECT version, content, effective_date FROM legal_documents 
     WHERE document_type = $1 ORDER BY effective_date DESC LIMIT 1`,
    [docType]
  );
  return rows[0] || null;
}

export async function recordLegalAcceptance(
  userId: string,
  docType: "tos" | "privacy",
  version: string
): Promise<void> {
  await pool.query(
    `INSERT INTO legal_acceptances (user_id, document_type, version)
     VALUES ($1, $2, $3)`,
    [userId, docType, version]
  );

  const docKey = docType === "tos" ? "accepted_tos_version" : "accepted_privacy_version";
  await pool.query(`UPDATE users SET ${docKey} = $1, accepted_at = NOW() WHERE id = $2`, [
    version,
    userId,
  ]);
}

export async function hasUserAcceptedLatest(
  userId: string,
  docType: "tos" | "privacy"
): Promise<boolean> {
  const latest = await getLatestLegalDocument(docType);
  if (!latest) return true;

  const { rows } = await pool.query(
    `SELECT accepted_tos_version, accepted_privacy_version FROM users WHERE id = $1`,
    [userId]
  );

  if (!rows[0]) return false;

  const key = docType === "tos" ? "accepted_tos_version" : "accepted_privacy_version";
  return rows[0][key] === latest.version;
}

export async function upsertLegalDocument(
  docType: "tos" | "privacy",
  version: string,
  content: string,
  effectiveDate: Date
): Promise<void> {
  await pool.query(
    `INSERT INTO legal_documents (document_type, version, content, effective_date)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [docType, version, content, effectiveDate]
  );
}
