output "alb_dns_name" {
  value = aws_alb.main.dns_name
}

output "alb_zone_id" {
  value = aws_alb.main.zone_id
}

output "alb_arn_suffix" {
  value = aws_alb.main.arn_suffix
}

output "blue_tg_arn_suffix" {
  value = aws_alb_target_group.blue.arn_suffix
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}
