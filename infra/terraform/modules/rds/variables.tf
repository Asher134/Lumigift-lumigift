variable "env" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "app_security_group_id" { type = string }
variable "instance_class" { type = string; default = "db.t4g.micro" }
variable "db_password" { type = string; sensitive = true }
variable "tags" { type = map(string); default = {} }
