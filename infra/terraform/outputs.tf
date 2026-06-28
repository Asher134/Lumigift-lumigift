output "app_url" {
  description = "ALB DNS name (route traffic here or alias in Route 53)"
  value       = aws_alb.main.dns_name
}

output "db_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "ECS cluster name (useful for deploy scripts)"
  value       = aws_ecs_cluster.main.name
}
