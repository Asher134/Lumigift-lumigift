variable "env" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "app_image" { type = string }
variable "aws_region" { type = string }
variable "db_secret_arn" { type = string }
variable "redis_secret_arn" { type = string }
variable "nextauth_secret_arn" { type = string }
variable "cron_secret_arn" { type = string }
variable "min_capacity" { type = number; default = 2 }
variable "max_capacity" { type = number; default = 10 }
variable "tags" { type = map(string); default = {} }
