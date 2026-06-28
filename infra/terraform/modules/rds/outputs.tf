output "endpoint" {
  value     = aws_db_instance.postgres.endpoint
  sensitive = true
}

output "security_group_id" {
  value = aws_security_group.db.id
}
