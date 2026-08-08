variable "name_prefix" { type = string }
variable "aws_region" { type = string }

# ── Networking ────────────────────────────────────────────────────────────────
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "sg_alb_id" { type = string }
variable "acm_certificate_arn" { type = string }

# ── Image ─────────────────────────────────────────────────────────────────────
variable "ecr_repository_url" { type = string }
variable "ecr_repository_arn" { type = string }
variable "app_version" {
  type    = string
  default = "latest"
}

# ── Application ───────────────────────────────────────────────────────────────
variable "secrets_arn" { type = string }
variable "app_domain" { type = string }
variable "cron_secret" {
  type      = string
  sensitive = true
}
variable "db_host" {
  description = "RDS endpoint address (Postgres, replaces the old containerized db service)"
  type        = string
}
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "db_password" {
  type      = string
  sensitive = true
}

# ── EC2 ───────────────────────────────────────────────────────────────────────
variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "ssh_key_name" {
  description = "Name of an existing AWS EC2 key pair to use for SSH access"
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to SSH into EC2. Restrict to known IPs in production."
  type        = string
  default     = "0.0.0.0/0"
}

variable "root_volume_size_gb" {
  type    = number
  default = 30
}

# ── ALB ───────────────────────────────────────────────────────────────────────
variable "deletion_protection" {
  type    = bool
  default = false
}
