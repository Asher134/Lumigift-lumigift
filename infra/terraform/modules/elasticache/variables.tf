variable "env" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "app_security_group_id" { type = string }
variable "node_type" { type = string; default = "cache.t4g.micro" }
variable "tags" { type = map(string); default = {} }
