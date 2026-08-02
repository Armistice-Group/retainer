data "aws_caller_identity" "current" {}

# ── Secrets Manager ────────────────────────────────────────────────────────────
# App secrets (API keys, auth credentials) live here. Terraform creates the
# secret with placeholders; update via Console/CLI after first apply — the
# ignore_changes below prevents future applies from overwriting your values.

resource "aws_secretsmanager_secret" "app" {
  name        = "${var.name_prefix}/app"
  description = "Retainer application secrets"
  tags        = { Name = "${var.name_prefix}-app-secrets" }
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    AUTH_SECRET                = "REPLACE_ME_min_32_char_random_string"
    INTEGRATION_ENCRYPTION_KEY = "REPLACE_ME_encryption_key"
    RESEND_API_KEY             = ""
    RESEND_FROM_EMAIL          = ""
    QUICKBOOKS_CLIENT_ID       = ""
    QUICKBOOKS_CLIENT_SECRET   = ""
    GITHUB_CLIENT_ID           = ""
    GITHUB_CLIENT_SECRET       = ""
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ── Networking ────────────────────────────────────────────────────────────────

module "networking" {
  source      = "./modules/networking"
  name_prefix = var.name_prefix
  vpc_cidr    = var.vpc_cidr
}

# ── ECR (application image) ───────────────────────────────────────────────────

module "ecr" {
  source      = "./modules/ecr"
  name_prefix = var.name_prefix
}

# ── DNS + ACM ─────────────────────────────────────────────────────────────────
# Creates the ACM cert only — root_domain's DNS stays on the registrar
# (Namecheap), so validation and the app records (root/www → ALB) are added
# there by hand. See `validation_records` / `alb_dns` outputs.

module "dns" {
  source = "./modules/dns"

  root_domain = var.root_domain
}

# ── EC2 (single instance + ALB) ────────────────────────────────────────────────
# Image is pulled from ECR using the instance's IAM role. Deploys are done by
# pushing a new image tag and restarting the compose stack (see DEPLOYMENT.md).

module "ec2" {
  source      = "./modules/ec2"
  name_prefix = var.name_prefix
  aws_region  = var.aws_region

  # Networking
  vpc_id              = module.networking.vpc_id
  public_subnet_ids   = module.networking.public_subnet_ids
  sg_alb_id           = module.networking.sg_alb_id
  acm_certificate_arn = module.dns.certificate_arn

  # Image
  ecr_repository_url = module.ecr.repository_url
  ecr_repository_arn = module.ecr.repository_arn
  app_version        = var.app_version

  # Secrets
  secrets_arn = aws_secretsmanager_secret.app.arn

  # Application config
  app_domain  = var.root_domain
  db_name     = var.db_name
  db_username = var.db_username
  db_password = var.db_password

  # EC2 config
  instance_type       = var.ec2_instance_type
  root_volume_size_gb = var.ec2_root_volume_gb
  ssh_key_name        = var.ec2_ssh_key_name
  ssh_allowed_cidr    = var.ec2_ssh_allowed_cidr
  deletion_protection = var.deletion_protection
}
