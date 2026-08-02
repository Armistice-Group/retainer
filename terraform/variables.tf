# ── General ───────────────────────────────────────────────────────────────────

variable "environment" {
  description = "Deployment environment (prod, staging)"
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
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

# ── Database (containerized Postgres on the EC2 instance) ────────────────────

variable "db_name" {
  type    = string
  default = "consulthub"
}

variable "db_username" {
  type    = string
  default = "app"
}

variable "db_password" {
  description = "Postgres password for the containerized db (min 8 chars, no @, /, or spaces)"
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

variable "ec2_ssh_public_key" {
  description = <<-EOT
    Public SSH key placed on the EC2 instance.
    Generate with: ssh-keygen -t ed25519 -f ~/.ssh/retainer-deploy -C deploy@retainer
  EOT
  type        = string
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
