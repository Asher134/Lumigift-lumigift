#!/usr/bin/env bash
# scripts/backup.sh — PostgreSQL backup to S3 with point-in-time recovery support
# Usage: ./scripts/backup.sh [--restore <timestamp>]
# Required env vars: DATABASE_URL, BACKUP_S3_BUCKET, AWS_REGION (optional, defaults to us-east-1)
set -euo pipefail

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BACKUP_FILE="lumigift-backup-${TIMESTAMP}.dump"
S3_PREFIX="backups"
REGION="${AWS_REGION:-us-east-1}"

require_env() {
  for var in "$@"; do
    [[ -z "${!var:-}" ]] && { echo "ERROR: $var is not set"; exit 1; }
  done
}

# ── Backup ────────────────────────────────────────────────────────────────────
backup() {
  require_env DATABASE_URL BACKUP_S3_BUCKET

  echo "[$(date -u +%T)] Starting backup: $BACKUP_FILE"

  pg_dump \
    --format=custom \
    --compress=9 \
    --no-password \
    "$DATABASE_URL" \
    --file="/tmp/${BACKUP_FILE}"

  aws s3 cp \
    "/tmp/${BACKUP_FILE}" \
    "s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}" \
    --region "$REGION" \
    --sse aws:kms

  rm -f "/tmp/${BACKUP_FILE}"
  echo "[$(date -u +%T)] Backup complete: s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}"
}

# ── Restore ───────────────────────────────────────────────────────────────────
# Usage: ./backup.sh --restore 2026-05-31T02:00:00Z
restore() {
  local target_ts="$1"
  require_env DATABASE_URL BACKUP_S3_BUCKET

  echo "[$(date -u +%T)] Finding backup closest to: $target_ts"

  # List all backups, pick the latest one at or before the target timestamp
  local chosen
  chosen=$(aws s3 ls "s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}/" --region "$REGION" \
    | awk '{print $4}' \
    | grep '^lumigift-backup-' \
    | sed 's/lumigift-backup-//' | sed 's/\.dump$//' \
    | sort \
    | awk -v ts="$target_ts" '$0 <= ts {last=$0} END {print last}')

  [[ -z "$chosen" ]] && { echo "ERROR: No backup found at or before $target_ts"; exit 1; }

  local restore_file="lumigift-backup-${chosen}.dump"
  echo "[$(date -u +%T)] Restoring from: $restore_file"

  aws s3 cp \
    "s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}/${restore_file}" \
    "/tmp/${restore_file}" \
    --region "$REGION"

  pg_restore \
    --no-password \
    --clean \
    --if-exists \
    --dbname="$DATABASE_URL" \
    "/tmp/${restore_file}"

  rm -f "/tmp/${restore_file}"
  echo "[$(date -u +%T)] Restore complete from backup: $chosen"
}

# ── Entrypoint ────────────────────────────────────────────────────────────────
case "${1:-backup}" in
  --restore)
    [[ -z "${2:-}" ]] && { echo "Usage: $0 --restore <ISO8601-timestamp>"; exit 1; }
    restore "$2"
    ;;
  backup|"")
    backup
    ;;
  *)
    echo "Usage: $0 [--restore <ISO8601-timestamp>]"
    exit 1
    ;;
esac
