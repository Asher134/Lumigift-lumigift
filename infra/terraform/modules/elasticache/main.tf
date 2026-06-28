resource "aws_elasticache_subnet_group" "main" {
  name       = "lumigift-${var.env}"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "redis" {
  name   = "lumigift-${var.env}-redis"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }

  tags = var.tags
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "lumigift-${var.env}"
  engine               = "redis"
  node_type            = var.node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  tags                 = var.tags
}
