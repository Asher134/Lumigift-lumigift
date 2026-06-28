resource "aws_security_group" "alb" {
  name   = "lumigift-${var.env}-alb"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "aws_security_group" "app" {
  name   = "lumigift-${var.env}-app"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "aws_ecs_cluster" "main" {
  name = "lumigift-${var.env}"
  tags = var.tags
}

resource "aws_alb" "main" {
  name               = "lumigift-${var.env}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
  tags               = var.tags
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

  tags = var.tags
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

  tags = var.tags
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
    ignore_changes = [default_action]
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/lumigift-${var.env}"
  retention_in_days = 30
  tags              = var.tags
}

resource "aws_iam_role" "ecs_execution" {
  name = "lumigift-${var.env}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole"; Effect = "Allow"; Principal = { Service = "ecs-tasks.amazonaws.com" } }]
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
      Resource = [var.db_secret_arn, var.redis_secret_arn, var.nextauth_secret_arn, var.cron_secret_arn]
    }]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "lumigift-${var.env}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole"; Effect = "Allow"; Principal = { Service = "ecs-tasks.amazonaws.com" } }]
  })
}

resource "aws_ecs_task_definition" "app" {
  family                   = "lumigift-${var.env}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "app"
    image = var.app_image
    portMappings = [{ containerPort = 3000; hostPort = 3000 }]
    environment = [{ name = "NODE_ENV", value = "production" }]
    secrets = [
      { name = "DATABASE_URL",   value_from = var.db_secret_arn },
      { name = "REDIS_URL",      value_from = var.redis_secret_arn },
      { name = "NEXTAUTH_SECRET", value_from = var.nextauth_secret_arn },
      { name = "CRON_SECRET",    value_from = var.cron_secret_arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])

  tags = var.tags
}

resource "aws_ecs_service" "app" {
  name            = "lumigift-${var.env}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.min_capacity
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

  deployment_controller { type = "CODE_DEPLOY" }

  lifecycle {
    ignore_changes = [load_balancer, task_definition]
  }

  tags = var.tags
}

resource "aws_appautoscaling_target" "app" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
  depends_on         = [aws_ecs_service.app]
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "lumigift-${var.env}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension
  service_namespace  = aws_appautoscaling_target.app.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60.0
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
  }
}
