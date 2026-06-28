resource "aws_db_subnet_group" "main" {
  name       = "lumigift-${var.env}"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "db" {
  name   = "lumigift-${var.env}-db"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }

  tags = var.tags
}

resource "aws_db_instance" "postgres" {
  identifier             = "lumigift-${var.env}"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.instance_class
  allocated_storage      = 20
  db_name                = "lumigift"
  username               = "lumigift"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  skip_final_snapshot    = var.env != "prod"
  deletion_protection    = var.env == "prod"
  storage_encrypted      = true
  tags                   = var.tags
}
