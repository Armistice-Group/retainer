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

# ── RDS (Postgres, replaces the containerized db on the EC2 instance) ─────────

module "rds" {
  source      = "./modules/rds"
  name_prefix = var.name_prefix

  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.public_subnet_ids
  sg_ec2_id  = module.ec2.sg_ec2_id

  instance_class       = var.rds_instance_class
  allocated_storage_gb = var.rds_allocated_storage_gb
  db_name              = var.db_name
  db_username          = var.db_username
  db_password          = var.rds_master_password

  deletion_protection = var.deletion_protection
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

  # Application config — points at the RDS instance (module.rds), not a
  # containerized db on the instance itself.
  app_domain                = var.root_domain
  db_host                   = module.rds.endpoint
  db_name                   = var.db_name
  db_username               = var.db_username
  db_password               = var.rds_master_password
  cron_secret               = random_password.cron_secret.result
  retool_tunnel_public_keys = var.retool_tunnel_public_keys

  # EC2 config
  instance_type       = var.ec2_instance_type
  root_volume_size_gb = var.ec2_root_volume_gb
  ssh_key_name        = var.ec2_ssh_key_name
  ssh_allowed_cidr    = var.ec2_ssh_allowed_cidr
  deletion_protection = var.deletion_protection
}

# ── Recurring invoice cron ─────────────────────────────────────────────────────
# Baked directly into the instance's .env at boot (like APP_IMAGE/DATABASE_URL)
# rather than routed through Secrets Manager — it's Terraform-generated
# infrastructure config, not a human-provided credential, so it doesn't need
# the ignore_changes dance the app secret does.
resource "random_password" "cron_secret" {
  length  = 32
  special = false
}

# EventBridge Scheduler can't hit a raw HTTPS endpoint directly — an API
# destination + connection is the AWS-native way to call an external HTTP(S)
# API on a schedule with an auth header attached.
resource "aws_cloudwatch_event_connection" "cron" {
  name               = "${var.name_prefix}-cron-connection"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "Authorization"
      value = "Bearer ${random_password.cron_secret.result}"
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "recurring_invoices" {
  name                             = "${var.name_prefix}-recurring-invoices"
  invocation_endpoint              = "https://${var.root_domain}/api/cron/recurring-invoices"
  http_method                      = "POST"
  invocation_rate_limit_per_second = 1
  connection_arn                   = aws_cloudwatch_event_connection.cron.arn
}

# Mercury has no invoice-paid webhook (only transaction.created/updated on
# the org's own accounts), so this destination polls for us on a schedule
# instead — see src/app/api/cron/mercury-sync/route.ts.
resource "aws_cloudwatch_event_api_destination" "mercury_sync" {
  name                             = "${var.name_prefix}-mercury-sync"
  invocation_endpoint              = "https://${var.root_domain}/api/cron/mercury-sync"
  http_method                      = "POST"
  invocation_rate_limit_per_second = 1
  connection_arn                   = aws_cloudwatch_event_connection.cron.arn
}

resource "aws_iam_role" "scheduler_cron" {
  name = "${var.name_prefix}-scheduler-cron"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_cron_invoke" {
  name = "invoke-api-destination"
  role = aws_iam_role.scheduler_cron.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "events:InvokeApiDestination"
      Resource = [
        aws_cloudwatch_event_api_destination.recurring_invoices.arn,
        aws_cloudwatch_event_api_destination.mercury_sync.arn,
      ]
    }]
  })
}

# Daily at 13:00 UTC (9am ET) — late enough that overnight time entries from
# US-hours teams are logged, early enough that a generated draft gets
# reviewed same business day.
#
# Uses classic EventBridge Rules, not the newer EventBridge Scheduler —
# aws_scheduler_schedule's target types don't include "invoke an API
# destination" (confirmed the hard way: ValidationException on apply).
# API destinations are an EventBridge Rules concept; aws_cloudwatch_event_rule
# + aws_cloudwatch_event_target is the combination that actually supports them.
resource "aws_cloudwatch_event_rule" "recurring_invoices_daily" {
  name                = "${var.name_prefix}-recurring-invoices-daily"
  schedule_expression = "cron(0 13 * * ? *)"
}

resource "aws_cloudwatch_event_target" "recurring_invoices_daily" {
  rule     = aws_cloudwatch_event_rule.recurring_invoices_daily.name
  arn      = aws_cloudwatch_event_api_destination.recurring_invoices.arn
  role_arn = aws_iam_role.scheduler_cron.arn
}

# Hourly — a client who just paid through Mercury expects the invoice to
# flip to PAID within the hour, not by the next daily run.
resource "aws_cloudwatch_event_rule" "mercury_sync_hourly" {
  name                = "${var.name_prefix}-mercury-sync-hourly"
  schedule_expression = "rate(1 hour)"
}

resource "aws_cloudwatch_event_target" "mercury_sync_hourly" {
  rule     = aws_cloudwatch_event_rule.mercury_sync_hourly.name
  arn      = aws_cloudwatch_event_api_destination.mercury_sync.arn
  role_arn = aws_iam_role.scheduler_cron.arn
}
