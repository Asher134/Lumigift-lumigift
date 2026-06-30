# ─── KMS key for backup encryption ───────────────────────────────────────────

resource "aws_kms_key" "backup" {
  description             = "lumigift-${var.env} DB backup encryption"
  deletion_window_in_days = 14
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "backup" {
  name          = "alias/lumigift-${var.env}-backup"
  target_key_id = aws_kms_key.backup.key_id
}

# ─── S3 backup bucket ─────────────────────────────────────────────────────────

resource "aws_s3_bucket" "backup" {
  bucket        = "lumigift-${var.env}-db-backups"
  force_destroy = var.env != "prod"
  tags          = local.tags
}

resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.backup.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule {
    id     = "expire-after-30-days"
    status = "Enabled"
    filter { prefix = "backups/" }
    expiration { days = 30 }
    noncurrent_version_expiration { noncurrent_days = 7 }
  }
}

resource "aws_s3_bucket_public_access_block" "backup" {
  bucket                  = aws_s3_bucket.backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── IAM role for GitHub Actions backup job ───────────────────────────────────

data "aws_iam_policy_document" "backup_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [var.github_oidc_provider_arn]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:JosephOnuh/Lumigift-lumigift:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "lumigift-${var.env}-db-backup"
  assume_role_policy = data.aws_iam_policy_document.backup_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "backup_policy" {
  statement {
    sid     = "S3BackupWrite"
    actions = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"]
    resources = [
      aws_s3_bucket.backup.arn,
      "${aws_s3_bucket.backup.arn}/*",
    ]
  }
  statement {
    sid       = "KMSEncrypt"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
    resources = [aws_kms_key.backup.arn]
  }
  statement {
    sid       = "SecretsRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db_url.arn]
  }
}

resource "aws_iam_role_policy" "backup" {
  name   = "backup-policy"
  role   = aws_iam_role.backup.id
  policy = data.aws_iam_policy_document.backup_policy.json
}

# ─── CloudWatch alerts ────────────────────────────────────────────────────────

resource "aws_sns_topic" "backup_alerts" {
  name = "lumigift-${var.env}-backup-alerts"
  tags = local.tags
}

resource "aws_sns_topic_subscription" "backup_alerts_email" {
  topic_arn = aws_sns_topic.backup_alerts.arn
  protocol  = "email"
  endpoint  = var.ops_alert_email
}

# Alert when backup job fails (triggered by GitHub Actions via CloudWatch metric filter)
resource "aws_cloudwatch_log_group" "backup" {
  name              = "/lumigift/${var.env}/db-backup"
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_cloudwatch_log_metric_filter" "backup_failure" {
  name           = "lumigift-${var.env}-backup-failure"
  log_group_name = aws_cloudwatch_log_group.backup.name
  pattern        = "ERROR"

  metric_transformation {
    name      = "BackupFailureCount"
    namespace = "Lumigift/${var.env}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "backup_failure" {
  alarm_name          = "lumigift-${var.env}-backup-failure"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "BackupFailureCount"
  namespace           = "Lumigift/${var.env}"
  period              = 86400
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "DB backup failed"
  alarm_actions       = [aws_sns_topic.backup_alerts.arn]
  treat_missing_data  = "notBreaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "backup_missing" {
  alarm_name          = "lumigift-${var.env}-backup-missing"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BackupSuccessCount"
  namespace           = "Lumigift/${var.env}"
  period              = 86400
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "No successful DB backup in the last 24 hours"
  alarm_actions       = [aws_sns_topic.backup_alerts.arn]
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_log_metric_filter" "backup_success" {
  name           = "lumigift-${var.env}-backup-success"
  log_group_name = aws_cloudwatch_log_group.backup.name
  pattern        = "Backup complete"

  metric_transformation {
    name      = "BackupSuccessCount"
    namespace = "Lumigift/${var.env}"
    value     = "1"
  }
}

# ─── Cross-region replication (DR) ───────────────────────────────────────────

provider "aws" {
  alias  = "dr"
  region = var.backup_region
}

# Replica bucket in the DR region
resource "aws_s3_bucket" "backup_replica" {
  provider      = aws.dr
  bucket        = "lumigift-${var.env}-db-backups-replica"
  force_destroy = var.env != "prod"
  tags          = local.tags
}

resource "aws_s3_bucket_versioning" "backup_replica" {
  provider = aws.dr
  bucket   = aws_s3_bucket.backup_replica.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_public_access_block" "backup_replica" {
  provider                = aws.dr
  bucket                  = aws_s3_bucket.backup_replica.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# IAM role that S3 uses to replicate objects
resource "aws_iam_role" "backup_replication" {
  name = "lumigift-${var.env}-backup-replication"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "backup_replication" {
  name = "replication-policy"
  role = aws_iam_role.backup_replication.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
        Resource = aws_s3_bucket.backup.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl", "s3:GetObjectVersionTagging"]
        Resource = "${aws_s3_bucket.backup.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"]
        Resource = "${aws_s3_bucket.backup_replica.arn}/*"
      }
    ]
  })
}

# Replication configuration on the source bucket
resource "aws_s3_bucket_replication_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  role   = aws_iam_role.backup_replication.arn

  rule {
    id     = "replicate-to-dr-region"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.backup_replica.arn
      storage_class = "STANDARD_IA"
    }
  }

  depends_on = [aws_s3_bucket_versioning.backup]
}
