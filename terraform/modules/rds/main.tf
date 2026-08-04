# ── DB subnet group ────────────────────────────────────────────────────────────
# Reuses the existing public subnets (this account has no private subnet / NAT
# gateway — nothing else has needed one). The instance itself stays unreachable
# from the internet via publicly_accessible = false and the security group
# below, regardless of the subnets' own route tables.

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnet-group"
  subnet_ids = var.subnet_ids
  tags       = { Name = "${var.name_prefix}-db-subnet-group" }
}

# ── Security group ────────────────────────────────────────────────────────────
# Only the app EC2 instance's security group may reach Postgres.

resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds"
  description = "Retainer RDS - Postgres from the app EC2 instance only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Postgres from app EC2"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.sg_ec2_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name_prefix}-sg-rds" }
}

# ── RDS instance ───────────────────────────────────────────────────────────────

resource "aws_db_instance" "this" {
  identifier     = "${var.name_prefix}-postgres"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage = var.allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = var.backup_retention_days
  backup_window           = "07:00-08:00"
  maintenance_window      = "sun:08:30-sun:09:30"

  auto_minor_version_upgrade = true
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${var.name_prefix}-postgres-final"

  apply_immediately = false

  tags = { Name = "${var.name_prefix}-rds" }
}
