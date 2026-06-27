terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — store in S3 + DynamoDB lock table
  # Replace bucket/table names before first apply
  backend "s3" {
    bucket         = "lumigift-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "lumigift-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

# ─── PostgreSQL (RDS) ─────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "lumigift-${var.env}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_instance" "postgres" {
  identifier             = "lumigift-${var.env}"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.db_instance_class
  allocated_storage      = 20
  db_name                = "lumigift"
  username               = "lumigift"
  password               = var.db_password   # injected from secret store — never hardcoded
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  skip_final_snapshot    = var.env != "prod"
  deletion_protection    = var.env == "prod"
  storage_encrypted      = true
  backup_retention_period = 7               # retain automated snapshots for 7 days
  multi_az               = var.env == "prod" # synchronous standby in a second AZ

  tags = local.tags
}

# ─── Redis (ElastiCache) ──────────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "main" {
  name       = "lumigift-${var.env}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "lumigift-${var.env}"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  tags = local.tags
}

# ─── Compute — ECS Fargate (Blue/Green) ──────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "lumigift-${var.env}"
  tags = local.tags
}

resource "aws_alb" "main" {
  name               = "lumigift-${var.env}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  tags = local.tags
}

resource "aws_alb_target_group" "blue" {
  name        = "lumigift-${var.env}-blue"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = local.tags
}

resource "aws_alb_target_group" "green" {
  name        = "lumigift-${var.env}-green"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = local.tags
}

resource "aws_alb_listener" "http" {
  load_balancer_arn = aws_alb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.blue.arn
  }

  lifecycle {
    ignore_changes = [default_action] # Managed by CodeDeploy during blue-green
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "lumigift-${var.env}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "app"
      image = var.app_image
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "LOG_LEVEL", value = "info" }
      ]
      secrets = [
        { name = "DATABASE_URL", value_from = aws_secretsmanager_secret.db_url.arn },
        { name = "REDIS_URL", value_from = aws_secretsmanager_secret.redis_url.arn },
        { name = "NEXTAUTH_SECRET", value_from = aws_secretsmanager_secret.nextauth_secret.arn },
        { name = "CRON_SECRET", value_from = aws_secretsmanager_secret.cron_secret.arn }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = local.tags
}

resource "aws_ecs_service" "app" {
  name            = "lumigift-${var.env}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.app.id]
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.blue.arn
    container_name   = "app"
    container_port   = 3000
  }

  deployment_controller {
    type = "CODE_DEPLOY"
  }

  lifecycle {
    ignore_changes = [load_balancer, task_definition] # Managed by CodeDeploy
  }

  tags = local.tags
}

# ─── IAM Roles ────────────────────────────────────────────────────────────────

resource "aws_iam_role" "ecs_execution" {
  name = "lumigift-${var.env}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_secrets" {
  name = "lumigift-${var.env}-ecs-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = "secretsmanager:GetSecretValue"
      Effect   = "Allow"
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
    }]
  })
}

# ECS task role and least-privilege Secrets Manager policy are defined in iam.tf

# ─── CloudWatch Logs ──────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/lumigift-${var.env}"
  retention_in_days = 30
  tags              = local.tags
}

# ─── Deployment — CodeDeploy (Blue/Green) ────────────────────────────────────

resource "aws_codedeploy_app" "app" {
  compute_platform = "ECS"
  name             = "lumigift-${var.env}"
}

resource "aws_codedeploy_deployment_group" "app" {
  app_name               = aws_codedeploy_app.app.name
  deployment_config_name = "CodeDeployDefault.ECSAllAtOnce"
  deployment_group_name  = "lumigift-${var.env}"
  service_role_arn       = aws_iam_role.codedeploy.arn

  auto_rollback_configuration {
    enabled = true
    events  = ["DEPLOYMENT_FAILURE"]
  }

  blue_green_deployment_config {
    deployment_ready_option {
      action_on_timeout = "CONTINUE_DEPLOYMENT"
    }

    terminate_blue_instances_on_deployment_success {
      action                           = "TERMINATE"
      termination_wait_time_in_minutes = 5
    }
  }

  deployment_style {
    deployment_option = "WITH_TRAFFIC_CONTROL"
    deployment_type   = "BLUE_GREEN"
  }

  ecs_service {
    cluster_name = aws_ecs_cluster.main.name
    service_name = aws_ecs_service.app.name
  }

  load_balancer_info {
    target_group_pair_info {
      prod_traffic_route {
        listener_arns = [aws_alb_listener.http.arn]
      }

      target_group {
        name = aws_alb_target_group.blue.name
      }

      target_group {
        name = aws_alb_target_group.green.name
      }
    }
  }
}

resource "aws_iam_role" "codedeploy" {
  name = "lumigift-${var.env}-codedeploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "codedeploy.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "codedeploy" {
  role       = aws_iam_role.codedeploy.name
  policy_arn = "arn:aws:iam::aws:policy/AWSCodeDeployRoleForECS"
}

# ─── DNS (Route 53) ───────────────────────────────────────────────────────────

data "aws_route53_zone" "main" {
  name = var.domain_name
}

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.env == "prod" ? var.domain_name : "${var.env}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_alb.main.dns_name
    zone_id                = aws_alb.main.zone_id
    evaluate_target_health = true
  }
}

# ─── Secrets (AWS Secrets Manager) ───────────────────────────────────────────
# Secrets are created empty; values are set out-of-band via the AWS console
# or CI pipeline — never stored in Terraform state as plaintext.

resource "aws_secretsmanager_secret" "db_url" {
  name = "lumigift/${var.env}/DATABASE_URL"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "redis_url" {
  name = "lumigift/${var.env}/REDIS_URL"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "nextauth_secret" {
  name = "lumigift/${var.env}/NEXTAUTH_SECRET"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "cron_secret" {
  name = "lumigift/${var.env}/CRON_SECRET"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "paystack_secret_key" {
  name = "lumigift/${var.env}/PAYSTACK_SECRET_KEY"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "stripe_secret_key" {
  name = "lumigift/${var.env}/STRIPE_SECRET_KEY"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "stripe_webhook_secret" {
  name = "lumigift/${var.env}/STRIPE_WEBHOOK_SECRET"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "termii_api_key" {
  name = "lumigift/${var.env}/TERMII_API_KEY"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "stellar_server_secret_key" {
  name = "lumigift/${var.env}/STELLAR_SERVER_SECRET_KEY"
  tags = local.tags
}

resource "aws_secretsmanager_secret" "cloudinary_api_secret" {
  name = "lumigift/${var.env}/CLOUDINARY_API_SECRET"
  tags = local.tags
}

# ─── Security Groups ──────────────────────────────────────────────────────────

resource "aws_security_group" "db" {
  name        = "lumigift-${var.env}-db"
  description = "PostgreSQL: allow inbound only from app servers"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from app servers only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # No egress — DB never initiates outbound connections
  egress {
    description = "Deny all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = []
  }

  tags = merge(local.tags, { Name = "lumigift-${var.env}-db" })
}

resource "aws_security_group" "redis" {
  name        = "lumigift-${var.env}-redis"
  description = "Redis: allow inbound only from app servers"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from app servers only"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # No egress — Redis never initiates outbound connections
  egress {
    description = "Deny all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = []
  }

  tags = merge(local.tags, { Name = "lumigift-${var.env}-redis" })
}

resource "aws_security_group" "alb" {
  name        = "lumigift-${var.env}-alb"
  description = "ALB: expose only ports 80 and 443 to the public internet"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    description     = "Forward to app containers"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  tags = merge(local.tags, { Name = "lumigift-${var.env}-alb" })
}

resource "aws_security_group" "app" {
  name        = "lumigift-${var.env}-app"
  description = "App containers: accept traffic from ALB only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from ALB only"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Allow all outbound (HTTPS to Stellar, Paystack, AWS APIs)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "lumigift-${var.env}-app" })
}

resource "aws_security_group" "bastion" {
  name        = "lumigift-${var.env}-bastion"
  description = "Bastion host: SSH restricted to VPN CIDR only"
  vpc_id      = var.vpc_id

  ingress {
    description = "SSH from VPN only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.vpn_cidr_blocks
  }

  egress {
    description = "Allow outbound to private subnets"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = var.private_subnet_cidrs
  }

  tags = merge(local.tags, { Name = "lumigift-${var.env}-bastion" })
}

# ─── Locals ───────────────────────────────────────────────────────────────────

locals {
  tags = {
    Project     = "lumigift"
    Environment = var.env
    ManagedBy   = "terraform"
  }
}

# ─── Application Auto Scaling — ECS Fargate (min 2, max 10) ──────────────────

resource "aws_appautoscaling_target" "app" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  depends_on = [aws_ecs_service.app]
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "lumigift-${var.env}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension
  service_namespace  = aws_appautoscaling_target.app.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60.0
    scale_out_cooldown = 60   # react to spikes within 60 s
    scale_in_cooldown  = 300  # 5-minute cooldown to prevent flapping
  }
}

resource "aws_appautoscaling_policy" "requests" {
  name               = "lumigift-${var.env}-requests-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension
  service_namespace  = aws_appautoscaling_target.app.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label = "${aws_alb.main.arn_suffix}/${aws_alb_target_group.blue.arn_suffix}"
    }
    target_value       = 1000 # requests per target per minute
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
  }
}
