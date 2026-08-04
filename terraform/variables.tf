# ── General ───────────────────────────────────────────────────────────────────

variable "environment" {
  description = "Deployment environment (prod, staging)"
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-2"
}

variable "name_prefix" {
  description = "Prefix used for all resource names"
  type        = string
  default     = "retainer-prod"
}

# ── Domain ────────────────────────────────────────────────────────────────────

variable "root_domain" {
  description = "Root domain managed in Route 53 (e.g. consultainer.app). Retainer is a single app, so this domain (and www.) points straight at it."
  type        = string
}

# ── Networking ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

# ── Database ──────────────────────────────────────────────────────────────────
# db_name/db_username are shared with the RDS instance below. db_password is
# no longer used (it was the containerized-Postgres password, retired when
# the database moved to RDS) — kept only so existing tfvars files don't need
# an edit; see rds_master_password for the credential that's actually live.

variable "db_name" {
  type    = string
  default = "consulthub"
}

variable "db_username" {
  type    = string
  default = "app"
}

variable "db_password" {
  description = "Unused since the RDS migration — retained for tfvars compatibility."
  type        = string
  sensitive   = true
  default     = ""
}

# ── Database (RDS) ────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "rds_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "rds_master_password" {
  description = "Master password for the RDS Postgres instance (min 8 chars, no @, /, or spaces)"
  type        = string
  sensitive   = true
}

# ── Application image ─────────────────────────────────────────────────────────

variable "app_version" {
  description = "Docker image tag to deploy — must match a tag pushed to ECR"
  type        = string
  default     = "latest"
}

# ── EC2 ───────────────────────────────────────────────────────────────────────

variable "ec2_instance_type" {
  description = "EC2 instance type. t3.small (2GB RAM) comfortably runs the app + Postgres for initial users."
  type        = string
  default     = "t3.small"
}

variable "ec2_root_volume_gb" {
  description = "Root EBS volume size in GB (holds the Postgres data volume too)"
  type        = number
  default     = 30
}

variable "ec2_ssh_key_name" {
  description = "Name of an existing AWS EC2 key pair to use for SSH access"
  type        = string
  default     = "ag-dev-pair"
}

variable "ec2_ssh_allowed_cidr" {
  description = "CIDR that may SSH into EC2. Restrict to your office/VPN CIDR in production."
  type        = string
  default     = "0.0.0.0/0"
}

# ── Feature Flags ─────────────────────────────────────────────────────────────

variable "deletion_protection" {
  description = "Enable deletion protection on the ALB. Set false for dev to allow terraform destroy."
  type        = bool
  default     = false
}
