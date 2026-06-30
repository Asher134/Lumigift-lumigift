# ─── Terraform Remote State Bootstrap ────────────────────────────────────────
# Run once with local state before configuring the S3 backend:
#   terraform init
#   terraform apply -target=aws_s3_bucket.tf_state -target=aws_dynamodb_table.tf_locks
# Then add the backend "s3" block to main.tf and run: terraform init -migrate-state

provider "aws" {
  alias  = "bootstrap"
  region = var.aws_region
}

# ─── S3 bucket for Terraform state ───────────────────────────────────────────

resource "aws_s3_bucket" "tf_state" {
  bucket        = "lumigift-terraform-state"
  force_destroy = false
  tags          = local.tags
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket                  = aws_s3_bucket.tf_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── DynamoDB table for state locking ────────────────────────────────────────

resource "aws_dynamodb_table" "tf_locks" {
  name         = "lumigift-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery { enabled = true }

  tags = local.tags
}
