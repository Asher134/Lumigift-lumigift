output "redis_endpoint" {
  value     = aws_elasticache_cluster.redis.cache_nodes[0].address
  sensitive = true
}

output "security_group_id" {
  value = aws_security_group.redis.id
}
