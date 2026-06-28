# ─── ECS Task IAM Role — least-privilege Secrets Manager access ───────────────
#
# This file owns the ECS *task* role (runtime identity of the container).
# The ECS *execution* role (used by the ECS agent to pull images / inject
# secrets at startup) remains in main.tf alongside the other execution
# infrastructure.
#
# Security invariants enforced here:
#  • No wildcard (*) in Action or Resource — every permission is explicit.
#  • Only secretsmanager:GetSecretValue is granted — no List*, Describe*, etc.
#  • Each secret ARN is referenced by its Terraform resource, so the policy
#    is automatically updated when secrets are added or removed.

resource "aws_iam_role" "ecs_task" {
  name = "lumigift-${var.env}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "ECSTasksAssumeRole"
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })

  tags = local.tags
}

# Least-privilege: restrict GetSecretValue to the exact secret ARNs used by
# the application. No wildcards. Each ARN resolves to a specific secret version.
resource "aws_iam_role_policy" "ecs_task_secrets" {
  name = "lumigift-${var.env}-ecs-task-secrets"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsManagerReadOnly"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          aws_secretsmanager_secret.db_url.arn,
          aws_secretsmanager_secret.redis_url.arn,
          aws_secretsmanager_secret.nextauth_secret.arn,
          aws_secretsmanager_secret.cron_secret.arn,
          aws_secretsmanager_secret.paystack_secret_key.arn,
          aws_secretsmanager_secret.stripe_secret_key.arn,
          aws_secretsmanager_secret.stripe_webhook_secret.arn,
          aws_secretsmanager_secret.termii_api_key.arn,
          aws_secretsmanager_secret.stellar_server_secret_key.arn,
          aws_secretsmanager_secret.cloudinary_api_secret.arn,
        ]
      }
    ]
  })
}
