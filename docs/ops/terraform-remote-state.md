# Terraform Remote State — Migration Guide

## Overview

Terraform state is stored in an S3 bucket with DynamoDB locking so that:
- Concurrent `terraform apply` runs are serialised (no state corruption).
- State history is preserved via S3 versioning.
- State at rest is encrypted with AES-256.

| Resource | Value |
|----------|-------|
| S3 bucket | `lumigift-terraform-state` |
| S3 key | `prod/terraform.tfstate` |
| DynamoDB table | `lumigift-terraform-locks` |
| Region | `us-east-1` |
| Encryption | `AES256` (server-side) |

---

## First-time bootstrap (new environment)

The S3 bucket and DynamoDB table must exist *before* Terraform can use them as a backend.
Bootstrap them with local state, then migrate.

```bash
cd infra/terraform

# 1. Comment out the backend "s3" block in main.tf so Terraform uses local state
# 2. Init with local state
terraform init

# 3. Apply only the bootstrap resources
terraform apply \
  -target=aws_s3_bucket.tf_state \
  -target=aws_s3_bucket_versioning.tf_state \
  -target=aws_s3_bucket_server_side_encryption_configuration.tf_state \
  -target=aws_s3_bucket_public_access_block.tf_state \
  -target=aws_dynamodb_table.tf_locks

# 4. Re-enable the backend "s3" block in main.tf

# 5. Migrate local state to S3
terraform init -migrate-state
# Terraform will ask: "Do you want to copy existing state to the new backend?" → yes

# 6. Verify
terraform state list
```

---

## Migrating existing local state

If you already have a `terraform.tfstate` file with live resources:

```bash
# Ensure the S3 bucket and DynamoDB table exist (run bootstrap steps above first)

cd infra/terraform

# Uncomment / add the backend block, then:
terraform init -migrate-state
```

Terraform will prompt you to confirm the copy. After migration the local
`terraform.tfstate` file is no longer authoritative — delete or archive it.

---

## Day-to-day usage (CI/CD)

The `terraform.yml` workflow handles `terraform init` automatically. No manual steps
are needed for normal plan/apply runs. The workflow requires:

| GitHub Secret / Variable | Value |
|--------------------------|-------|
| `AWS_ACCESS_KEY_ID` | IAM key with S3 + DynamoDB access |
| `AWS_SECRET_ACCESS_KEY` | Corresponding secret |

Or, if using OIDC (recommended), the IAM role must have permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket",
    "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"
  ],
  "Resource": [
    "arn:aws:s3:::lumigift-terraform-state",
    "arn:aws:s3:::lumigift-terraform-state/*",
    "arn:aws:dynamodb:us-east-1:*:table/lumigift-terraform-locks"
  ]
}
```

---

## Disaster recovery — state corruption

If state becomes corrupted:

1. Disable state locking temporarily (only if the DynamoDB lock is stale):
   ```bash
   terraform force-unlock <LOCK_ID>
   ```
2. Retrieve a previous state version from S3 versioning:
   ```bash
   aws s3api list-object-versions \
     --bucket lumigift-terraform-state \
     --prefix prod/terraform.tfstate \
     --query 'Versions[*].[VersionId,LastModified]' \
     --output table
   aws s3api get-object \
     --bucket lumigift-terraform-state \
     --key prod/terraform.tfstate \
     --version-id <VERSION_ID> \
     terraform.tfstate.restore
   ```
3. Review the restored state, then upload it:
   ```bash
   aws s3 cp terraform.tfstate.restore \
     s3://lumigift-terraform-state/prod/terraform.tfstate
   ```
4. Run `terraform plan` to confirm no unintended drift before applying.
