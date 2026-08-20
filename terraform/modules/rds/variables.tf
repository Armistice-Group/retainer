variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Subnets for the DB subnet group (must span 2+ AZs). The instance is never publicly accessible regardless of subnet type."
  type        = list(string)
}

variable "sg_ec2_id" {
  description = "Security group of the app EC2 instance — the only thing allowed to reach Postgres."
  type        = string
}

variable "additional_allowed_security_group_ids" {
  description = "Extra security groups allowed to reach Postgres, beyond the app's own (sg_ec2_id) — e.g. another app's EC2 instance sharing this RDS instance under a separate database/role. Empty by default; this instance is single-tenant unless explicitly opted into sharing."
  type        = list(string)
  default     = []
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "allocated_storage_gb" {
  type    = number
  default = 20
}

variable "engine_version" {
  type    = string
  default = "16"
}

variable "db_name" {
  type = string
}

variable "db_username" {
  type = string
}

variable "db_password" {
  description = "Master password for the RDS instance (min 8 chars, no @, /, or spaces)"
  type        = string
  sensitive   = true
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type    = bool
  default = false
}
