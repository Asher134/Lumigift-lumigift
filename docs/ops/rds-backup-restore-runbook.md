# RDS Backup & Restore Runbook

## Backup Architecture

```
Primary region (us-east-1)                  DR region (us-west-2)
────────────────────────────                ───────────────────────
aws_db_instance.postgres                    aws_s3_bucket.backup_replica
  └─ automated snapshots (7-day retention)    └─ S3 replication (STANDARD_IA)

aws_s3_bucket.backup
  └─ pg_dump exports (30-day lifecycle)
  └─ replication → backup_replica
```

- **RDS automated snapshots** — taken daily by AWS, retained **7 days** (`backup_retention_period = 7`).
- **S3 pg_dump exports** — written by the GitHub Actions backup job to `s3://lumigift-<env>-db-backups/backups/` and **replicated** to `s3://lumigift-<env>-db-backups-replica/` in `us-west-2` via S3 Cross-Region Replication.
- Production RDS is `multi_az = true` for a synchronous standby in a second AZ.

---

## RDS Snapshot Retention

| Setting | Value |
|---------|-------|
| `backup_retention_period` | 7 days |
| Encryption | Inherited from KMS key (`storage_encrypted = true`) |

---

## S3 Cross-Region Replication

| Item | Value |
|------|-------|
| Source bucket | `lumigift-<env>-db-backups` (us-east-1) |
| Destination bucket | `lumigift-<env>-db-backups-replica` (us-west-2) |
| Storage class | `STANDARD_IA` |
| IAM role | `lumigift-<env>-backup-replication` |

---

## Restore from RDS Automated Snapshot

```bash
# 1. List available snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier lumigift-<env> \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table

# 2. Restore to a new instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lumigift-<env>-restored \
  --db-snapshot-identifier <snapshot-id> \
  --db-instance-class db.t4g.micro \
  --no-publicly-accessible

# 3. Wait for availability
aws rds wait db-instance-available \
  --db-instance-identifier lumigift-<env>-restored

# 4. Update DATABASE_URL in Secrets Manager, then redeploy ECS
aws ecs update-service --cluster lumigift-<env> --service lumigift-<env> --force-new-deployment
```

---

## Restore from S3 pg_dump

```bash
# 1. Find the backup (primary or replica)
aws s3 ls s3://lumigift-<env>-db-backups/backups/ --recursive | sort | tail -5
# from replica: aws s3 ls s3://lumigift-<env>-db-backups-replica/backups/ --recursive --region us-west-2 | sort | tail -5

# 2. Download and restore
aws s3 cp s3://lumigift-<env>-db-backups/backups/<file>.sql.gz /tmp/
gunzip /tmp/<file>.sql.gz
psql -h <rds-endpoint> -U lumigift -d lumigift_restore -f /tmp/<file>.sql
```

---

## Quarterly Restore Drill

1. Pick the most recent RDS snapshot or S3 dump.
2. Restore to a **temporary, isolated** RDS instance (blocked from app traffic).
3. Verify row counts on `gifts`, `users`, `transactions`.
4. Record RTO (target ≤ 30 min). Log result with timestamp in the ops incident log.
5. Delete the temporary instance immediately after.

---

## CloudWatch Alarms

| Alarm | Trigger | Contact |
|-------|---------|---------|
| `lumigift-<env>-backup-failure` | `BackupFailureCount >= 1` / 24 h | `var.ops_alert_email` |
| `lumigift-<env>-backup-missing` | `BackupSuccessCount < 1` / 24 h | `var.ops_alert_email` |
