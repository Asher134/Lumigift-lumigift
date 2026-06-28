# Lumigift Terraform Infrastructure

All cloud infrastructure is defined here as Terraform code (AWS provider, Terraform ≥ 1.6).

## Directory layout

```
infra/terraform/
├── main.tf                   # Root config — all resources (monolith, refactor target)
├── variables.tf              # Root input variables
├── outputs.tf                # Root outputs
├── terraform.tfvars.example  # Copy to terraform.tfvars; never commit the real file
└── modules/
    ├── vpc/                  # VPC, subnets, NAT gateways, route tables
    ├── compute/              # ECS cluster, ALB, task def, service, auto-scaling
    ├── rds/                  # RDS PostgreSQL 16
    ├── elasticache/          # ElastiCache Redis 7
    └── dns/                  # Route 53 records
```

## Remote state

State is stored in S3 with DynamoDB locking (see `backend "s3"` in `main.tf`).
Bucket and table names are parameterised — set them before the first `terraform init`.

## Workspaces

Use Terraform workspaces to manage staging and production from the same codebase:

```bash
# First time setup
terraform workspace new staging
terraform workspace new production

# Deploy to staging
terraform workspace select staging
terraform plan  -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars   # requires manual approval in CI

# Deploy to production
terraform workspace select production
terraform plan  -var-file=production.tfvars
terraform apply -var-file=production.tfvars
```

Create `staging.tfvars` and `production.tfvars` by copying `terraform.tfvars.example`.
**Never commit `.tfvars` files** — they are git-ignored.

## CI

`.github/workflows/terraform.yml` runs `terraform plan` on every PR that touches `infra/terraform/**`.
`terraform apply` requires manual approval via the GitHub environment protection gate (`production`).

## Secrets

All secrets are injected via `TF_VAR_*` environment variables in CI or AWS Secrets Manager at runtime.
Never store secrets in `.tfvars` files or Terraform state.
